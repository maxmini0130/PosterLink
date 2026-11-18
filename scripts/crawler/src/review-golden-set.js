#!/usr/bin/env node
/**
 * Review golden set (2026-11-19).
 *
 * Every source-review batch under data/results/source-review-* keeps the row
 * as the crawler left it (backup.json) and the row after a person's review
 * (after-<id>.json). Pairing them gives "what the crawler produced" versus
 * "what the source actually says" for each field.
 *
 *   node src/review-golden-set.js build [--results=<dir>]
 *        data/results → test-fixtures/review-golden-set.json (local only)
 *   node src/review-golden-set.js measure [--stored] [--json]
 *        per-field accuracy; date/organizer fields are re-extracted with the
 *        current code from the fixture's stored inputs (replay)
 *   node src/review-golden-set.js check [--tolerance=1] [--summary=<file>]
 *        fails when a metric drops below test-fixtures/review-golden-baseline.json
 *   node src/review-golden-set.js baseline
 *        rewrites the baseline from the current code
 *
 * measure/check/baseline read only the committed fixture and baseline: no
 * network, DB, environment or data/results. They are run in CI.
 *
 * For a poster reviewed more than once, the earliest backup is the crawler
 * value and the latest after-snapshot is the truth.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildStructuredPosterFields } from "./poster-structured-fields.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const RESULTS = path.join(REPO_ROOT, "data/results");
export const GOLDEN_FILE = path.resolve(__dirname, "../test-fixtures/review-golden-set.json");
export const BASELINE_FILE = path.resolve(__dirname, "../test-fixtures/review-golden-baseline.json");

const KST_MS = 9 * 60 * 60 * 1000;

/** Seoul calendar day of a timestamp, or null. */
export function kstDate(value) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t + KST_MS).toISOString().slice(0, 10);
}

/** Seoul wall-clock minute (YYYY-MM-DDTHH:MM), or null. */
export function kstMinute(value) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t + KST_MS).toISOString().slice(0, 16);
}

function normText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim() || null;
}

/** The fields the golden set keeps for one poster row. */
export function pickFields(row) {
  return {
    title: normText(row.title),
    organizer_name: normText(row.organizer_name),
    application_start_at: row.application_start_at ?? null,
    application_end_at: row.application_end_at ?? null,
    event_start_at: row.event_start_at ?? null,
    event_end_at: row.event_end_at ?? null,
    deadline_type: row.deadline_type ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    link_urls: (row.poster_links ?? []).map((link) => link.url).sort(),
    category_ids: (row.poster_categories ?? []).map((c) => c.category_id).sort(),
    audience_ids: (row.poster_audiences ?? []).map((a) => a.audience_id).sort(),
    status: row.poster_status ?? null,
  };
}

// The repository is public: phone numbers, e-mail addresses and the contact
// fact never go into the fixture.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+82[\s-]?)?\(?0\d{1,2}\)?[\s.-]?\d{3,4}[\s.-]\d{4}|\b1[5-9]\d{2}-\d{4}\b/g;

export function redactText(value) {
  if (value == null) return null;
  return String(value).replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}

function redactDeep(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]));
  }
  return value;
}

const pickKeys = (obj, keys) =>
  obj && typeof obj === "object"
    ? Object.fromEntries(keys.filter((k) => obj[k] != null).map((k) => [k, obj[k]]))
    : {};

/**
 * What the structuring step reads from a stored row (buildStructuredPosterFields):
 * the summary text and the parts of field_verification it consults. Reviewer
 * notes and model reasoning are left out.
 */
export function pickReplayInput(row) {
  const fv = row.field_verification ?? {};
  const readable = fv.readableNotice ?? {};
  const facts = { ...(readable.facts ?? {}) };
  delete facts.contact;
  return redactDeep({
    summary_short: row.summary_short ?? null,
    summary_long: row.summary_long ?? null,
    field_verification: {
      ...pickKeys(fv, ["confidence", "correctedOrgName", "applicationOrganizationName"]),
      organization: pickKeys(fv.organization, ["organizerName", "displayOrgName", "applicationOrganizationName", "applicationOrgName", "confidence"]),
      readableNotice: { facts, ...pickKeys(readable, ["factsLlmMeta"]) },
      posterImageOcr: pickKeys(fv.posterImageOcr, ["posterTextSummary"]),
    },
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function buildGoldenSet(resultsDir = RESULTS) {
  const dirs = (await fs.readdir(resultsDir)).filter((d) => /^source-review-\d{8}/.test(d)).sort();
  const crawler = new Map();
  const truth = new Map();
  for (const dir of dirs) {
    const base = path.join(resultsDir, dir);
    let backup;
    try {
      backup = await readJson(path.join(base, "backup.json"));
    } catch {
      continue;
    }
    for (const row of backup) {
      if (!crawler.has(row.id)) {
        crawler.set(row.id, { batch: dir, source_key: row.source_key ?? null, fields: pickFields(row), input: pickReplayInput(row) });
      }
    }
    for (const file of await fs.readdir(base)) {
      const m = file.match(/^after-([0-9a-f-]{36})\.json$/);
      if (!m) continue;
      const after = await readJson(path.join(base, file));
      truth.set(m[1], { batch: dir, fields: pickFields(after) });
    }
  }
  const rows = [];
  for (const [id, t] of truth) {
    const c = crawler.get(id);
    if (!c) continue;
    rows.push({ id, source_key: c.source_key, crawler_batch: c.batch, review_batch: t.batch, crawler: c.fields, input: c.input, reviewed: t.fields });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return { built_at: new Date().toISOString(), batches: dirs, count: rows.length, rows };
}

/** A stored timestamp that carries no time of day (UTC or Seoul midnight). */
function isMidnight(value) {
  return /T00:00:00(?:\.0+)?(?:Z|\+00:00|\+09:00)$/.test(String(value ?? ""));
}

/** The adapter's day-only event value when the stored one has no time. */
function eventInput(value) {
  if (!value) return null;
  return isMidnight(value) ? kstDate(value) : value;
}

/**
 * Re-run the structuring step with the current code on one golden row.
 * Inputs mirror upload-to-supabase: the deadline as a Seoul day (the upload
 * stage passes the day-only deadline), stored event values (day-only when they
 * carried no time), title + summary as source text. The upload-stage portal
 * deadline check is not replayed. Fields the step does not produce (title,
 * image, links, categories, audiences) keep the stored crawler value.
 */
export function replayRow(row) {
  const input = row.input ?? {};
  const c = row.crawler;
  const derived = buildStructuredPosterFields({
    fieldVerification: input.field_verification ?? {},
    applicationEndAt: kstDate(c.application_end_at),
    eventStartAt: eventInput(c.event_start_at),
    eventEndAt: eventInput(c.event_end_at),
    sourceText: [c.title, input.summary_short, input.summary_long].filter(Boolean).join("\n").slice(0, 10_000),
    fallbackOrganizerName: c.organizer_name,
    title: c.title,
  });
  return {
    ...c,
    organizer_name: normText(derived.organizer_name),
    deadline_type: derived.deadline_type ?? null,
    application_start_at: derived.application_start_at ?? null,
    application_end_at: derived.application_end_at ?? null,
    event_start_at: derived.event_start_at ?? null,
    event_end_at: derived.event_end_at ?? null,
  };
}

export const REPLAYED_FIELDS = new Set(["organizer_name", "deadline_type", "application_start_at", "application_end_at", "event_start_at", "event_end_at"]);

const sameSet = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Field checks: [name, source field, correct(row)]. */
export const FIELD_CHECKS = [
  ["title", "title", (r) => r.crawler.title === r.reviewed.title],
  ["organizer_name", "organizer_name", (r) => r.crawler.organizer_name === r.reviewed.organizer_name],
  ["deadline_type", "deadline_type", (r) => r.crawler.deadline_type === r.reviewed.deadline_type],
  ["application_end_at (day)", "application_end_at", (r) => kstDate(r.crawler.application_end_at) === kstDate(r.reviewed.application_end_at)],
  ["application_end_at (minute)", "application_end_at", (r) => kstMinute(r.crawler.application_end_at) === kstMinute(r.reviewed.application_end_at)],
  ["application_start_at (day)", "application_start_at", (r) => kstDate(r.crawler.application_start_at) === kstDate(r.reviewed.application_start_at)],
  ["event_start_at (day)", "event_start_at", (r) => kstDate(r.crawler.event_start_at) === kstDate(r.reviewed.event_start_at)],
  ["event_start_at (minute)", "event_start_at", (r) => kstMinute(r.crawler.event_start_at) === kstMinute(r.reviewed.event_start_at)],
  ["event_end_at (day)", "event_end_at", (r) => kstDate(r.crawler.event_end_at) === kstDate(r.reviewed.event_end_at)],
  ["event_end_at (minute)", "event_end_at", (r) => kstMinute(r.crawler.event_end_at) === kstMinute(r.reviewed.event_end_at)],
  ["thumbnail_url", "thumbnail_url", (r) => r.crawler.thumbnail_url === r.reviewed.thumbnail_url],
  ["links (no wrong link)", "link_urls", (r) => r.crawler.link_urls.every((u) => r.reviewed.link_urls.includes(u))],
  ["links (exact set)", "link_urls", (r) => sameSet(r.crawler.link_urls, r.reviewed.link_urls)],
  ["categories", "category_ids", (r) => sameSet(r.crawler.category_ids, r.reviewed.category_ids)],
  ["audiences", "audience_ids", (r) => sameSet(r.crawler.audience_ids, r.reviewed.audience_ids)],
];

/** Diagnostic patterns: how often a known crawler mistake appears. */
export const ERROR_PATTERNS = [
  ["deadline stored at UTC midnight (date-only not mapped to KST end of day)", (r) => /T00:00:00(?:\.000)?(?:\+00:00|Z)$/.test(r.crawler.application_end_at ?? "") && kstDate(r.crawler.application_end_at) !== kstDate(r.reviewed.application_end_at)],
  ["deadline set but reviewed as none", (r) => r.crawler.application_end_at && !r.reviewed.application_end_at],
  ["deadline equals reviewed event day", (r) => r.crawler.application_end_at && kstDate(r.crawler.application_end_at) !== kstDate(r.reviewed.application_end_at) && [kstDate(r.reviewed.event_start_at), kstDate(r.reviewed.event_end_at)].includes(kstDate(r.crawler.application_end_at))],
  ["ongoing (상시) not confirmed by review", (r) => r.crawler.deadline_type === "ongoing" && r.reviewed.deadline_type !== "ongoing"],
  ["organizer is a collection portal or bare 서울청년센터", (r) => /^(?:청년몽땅정보통|K-Startup|기업마당|온통청년|서울청년센터)$/.test(r.crawler.organizer_name ?? "") && r.crawler.organizer_name !== r.reviewed.organizer_name],
  ["links from other notices removed", (r) => r.crawler.link_urls.some((u) => !r.reviewed.link_urls.includes(u))],
  ["representative image replaced", (r) => r.crawler.thumbnail_url && r.reviewed.thumbnail_url && r.crawler.thumbnail_url !== r.reviewed.thumbnail_url],
];

/**
 * Per-field accuracy. With replay (default) the structured date/organizer
 * fields are re-extracted by the current code; stored: false measures the
 * crawler output as it was saved.
 */
export function measure(golden, { replay = true } = {}) {
  const kept = golden.rows.filter((r) => r.reviewed.status !== "rejected");
  const rows = replay ? kept.map((r) => ({ ...r, crawler: replayRow(r) })) : kept;
  const fields = FIELD_CHECKS.map(([name, sourceField, correct]) => {
    const ok = rows.filter(correct).length;
    return {
      field: name,
      source: replay && REPLAYED_FIELDS.has(sourceField) ? "replay" : "stored",
      total: rows.length,
      correct: ok,
      accuracy: rows.length ? Math.round((1000 * ok) / rows.length) / 10 : null,
    };
  });
  const patterns = ERROR_PATTERNS.map(([name, test]) => {
    const hits = rows.filter(test).length;
    return { pattern: name, count: hits, rate: rows.length ? Math.round((1000 * hits) / rows.length) / 10 : null };
  });
  return { mode: replay ? "replay" : "stored", rows: rows.length, excluded_rejected: golden.rows.length - rows.length, fields, patterns };
}

/** Baseline file content for a report: the correct counts per field. */
export function toBaseline(report, fixture) {
  return {
    note: "Golden-set accuracy of the current crawler code (npm run golden:baseline). CI fails when a field drops below it.",
    fixture_built_at: fixture.built_at,
    rows: report.rows,
    fields: Object.fromEntries(report.fields.map((f) => [f.field, { correct: f.correct, total: f.total, accuracy: f.accuracy }])),
  };
}

/**
 * Compare a report with the baseline. A field regresses when it loses more
 * than `tolerance` correct rows; gains never fail.
 */
export function compareWithBaseline(report, baseline, { tolerance = 1 } = {}) {
  const problems = [];
  if (baseline.rows !== report.rows) problems.push(`golden rows changed: baseline ${baseline.rows}, now ${report.rows} (refresh the baseline with npm run golden:baseline)`);
  const fields = report.fields.map((f) => {
    const base = baseline.fields?.[f.field];
    if (!base) return { ...f, base: null, delta: null, status: "new" };
    const delta = f.correct - base.correct;
    const status = delta < -tolerance ? "regressed" : delta < 0 ? "within tolerance" : delta > 0 ? "improved" : "same";
    return { ...f, base: base.correct, baseAccuracy: base.accuracy, delta, status };
  });
  for (const name of Object.keys(baseline.fields ?? {})) {
    if (!report.fields.some((f) => f.field === name)) problems.push(`field missing from report: ${name}`);
  }
  const regressed = fields.filter((f) => f.status === "regressed");
  const improved = fields.filter((f) => f.status === "improved" || f.status === "new");
  return { ok: problems.length === 0 && regressed.length === 0, problems, fields, regressed, improved, tolerance };
}

const pct = (v) => (v == null ? "-" : `${v}%`);
const signed = (n) => (n == null ? "-" : n > 0 ? `+${n}` : String(n));

export function formatComparisonTable(result) {
  const lines = [
    "| field | source | baseline | now | Δ rows | status |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const f of result.fields) {
    const mark = f.status === "regressed" ? "❌ regressed" : f.status === "improved" ? "⬆ improved" : f.status;
    lines.push(`| ${f.field} | ${f.source} | ${f.base == null ? "-" : `${pct(f.baseAccuracy)} (${f.base})`} | ${pct(f.accuracy)} (${f.correct}/${f.total}) | ${signed(f.delta)} | ${mark} |`);
  }
  return lines.join("\n");
}

function printReport(report) {
  const label = report.mode === "replay" ? "field accuracy (date/organizer fields replayed with the current code)" : "field accuracy of stored crawler output";
  console.log(`golden rows: ${report.rows} (rejected excluded: ${report.excluded_rejected})\n`);
  console.log(label);
  for (const f of report.fields) console.log(`  ${f.field.padEnd(30)} ${String(f.accuracy).padStart(5)}%  (${f.correct}/${f.total})  ${f.source}`);
  console.log("\nknown error patterns");
  for (const p of report.patterns) console.log(`  ${String(p.rate).padStart(5)}%  ${p.count.toString().padStart(3)}  ${p.pattern}`);
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.length ? rest.join("=") : true];
    }),
  );
}

async function main() {
  const mode = process.argv[2] ?? "measure";
  const args = parseArgs(process.argv.slice(3));
  if (mode === "build") {
    const golden = await buildGoldenSet(args.results ? path.resolve(String(args.results)) : RESULTS);
    await fs.mkdir(path.dirname(GOLDEN_FILE), { recursive: true });
    await fs.writeFile(GOLDEN_FILE, `${JSON.stringify(golden, null, 2)}\n`);
    console.log(JSON.stringify({ written: path.relative(REPO_ROOT, GOLDEN_FILE), count: golden.count, batches: golden.batches.length }));
    return;
  }
  const golden = await readJson(GOLDEN_FILE);
  if (mode === "measure") {
    const report = measure(golden, { replay: !args.stored });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    return;
  }
  const report = measure(golden);
  if (mode === "baseline") {
    await fs.writeFile(BASELINE_FILE, `${JSON.stringify(toBaseline(report, golden), null, 2)}\n`);
    printReport(report);
    console.log(`\nwritten ${path.relative(REPO_ROOT, BASELINE_FILE)}`);
    return;
  }
  if (mode === "check") {
    const tolerance = Number(args.tolerance ?? 1);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error(`invalid --tolerance=${args.tolerance}`);
    const baseline = await readJson(BASELINE_FILE);
    const result = compareWithBaseline(report, baseline, { tolerance });
    const table = formatComparisonTable(result);
    const verdict = result.ok
      ? `Golden-set check passed (${report.rows} rows, tolerance ${tolerance} row per field).`
      : `Golden-set check FAILED: ${result.regressed.length} field(s) dropped more than ${tolerance} row below the baseline.`;
    const hints = [...result.problems];
    if (result.improved.length) hints.push(`Improved: ${result.improved.map((f) => f.field).join(", ")}. Refresh the baseline with \`npm run golden:baseline\` and commit test-fixtures/review-golden-baseline.json.`);
    const markdown = ["### Review golden set", "", verdict, "", table, "", ...hints.map((h) => `- ${h}`)].join("\n");
    console.log(markdown);
    if (args.summary) await fs.appendFile(String(args.summary), `${markdown}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown mode: ${mode} (build | measure | check | baseline)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
