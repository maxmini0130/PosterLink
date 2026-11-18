#!/usr/bin/env node
/**
 * Review golden set (2026-11-19).
 *
 * Every source-review batch under data/results/source-review-* keeps the row
 * as the crawler left it (backup.json) and the row after a person's review
 * (after-<id>.json). Pairing them gives "what the crawler produced" versus
 * "what the source actually says" for each field.
 *
 *   node src/review-golden-set.js build     data/results → test-fixtures/review-golden-set.json
 *   node src/review-golden-set.js measure   per-field accuracy of the crawler output
 *
 * For a poster reviewed more than once, the earliest backup is the crawler
 * value and the latest after-snapshot is the truth.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const RESULTS = path.join(REPO_ROOT, "data/results");
export const GOLDEN_FILE = path.resolve(__dirname, "../test-fixtures/review-golden-set.json");

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
      if (!crawler.has(row.id)) crawler.set(row.id, { batch: dir, source_key: row.source_key ?? null, fields: pickFields(row) });
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
    rows.push({ id, source_key: c.source_key, crawler_batch: c.batch, review_batch: t.batch, crawler: c.fields, reviewed: t.fields });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return { built_at: new Date().toISOString(), batches: dirs, count: rows.length, rows };
}

const sameSet = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Field checks: [name, applies(row), correct(row)]. */
export const FIELD_CHECKS = [
  ["title", () => true, (r) => r.crawler.title === r.reviewed.title],
  ["organizer_name", () => true, (r) => r.crawler.organizer_name === r.reviewed.organizer_name],
  ["deadline_type", () => true, (r) => r.crawler.deadline_type === r.reviewed.deadline_type],
  ["application_end_at (day)", () => true, (r) => kstDate(r.crawler.application_end_at) === kstDate(r.reviewed.application_end_at)],
  ["application_end_at (minute)", () => true, (r) => kstMinute(r.crawler.application_end_at) === kstMinute(r.reviewed.application_end_at)],
  ["application_start_at (day)", () => true, (r) => kstDate(r.crawler.application_start_at) === kstDate(r.reviewed.application_start_at)],
  ["event_start_at (day)", () => true, (r) => kstDate(r.crawler.event_start_at) === kstDate(r.reviewed.event_start_at)],
  ["event_end_at (day)", () => true, (r) => kstDate(r.crawler.event_end_at) === kstDate(r.reviewed.event_end_at)],
  ["thumbnail_url", () => true, (r) => r.crawler.thumbnail_url === r.reviewed.thumbnail_url],
  ["links (no wrong link)", () => true, (r) => r.crawler.link_urls.every((u) => r.reviewed.link_urls.includes(u))],
  ["links (exact set)", () => true, (r) => sameSet(r.crawler.link_urls, r.reviewed.link_urls)],
  ["categories", () => true, (r) => sameSet(r.crawler.category_ids, r.reviewed.category_ids)],
  ["audiences", () => true, (r) => sameSet(r.crawler.audience_ids, r.reviewed.audience_ids)],
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

export function measure(golden) {
  const rows = golden.rows.filter((r) => r.reviewed.status !== "rejected");
  const fields = FIELD_CHECKS.map(([name, applies, correct]) => {
    const scoped = rows.filter(applies);
    const ok = scoped.filter(correct).length;
    return { field: name, total: scoped.length, correct: ok, accuracy: scoped.length ? Math.round((1000 * ok) / scoped.length) / 10 : null };
  });
  const patterns = ERROR_PATTERNS.map(([name, test]) => {
    const hits = rows.filter(test).length;
    return { pattern: name, count: hits, rate: rows.length ? Math.round((1000 * hits) / rows.length) / 10 : null };
  });
  return { rows: rows.length, excluded_rejected: golden.rows.length - rows.length, fields, patterns };
}

async function main() {
  const mode = process.argv[2] ?? "measure";
  if (mode === "build") {
    const golden = await buildGoldenSet();
    await fs.mkdir(path.dirname(GOLDEN_FILE), { recursive: true });
    await fs.writeFile(GOLDEN_FILE, `${JSON.stringify(golden, null, 2)}\n`);
    console.log(JSON.stringify({ written: path.relative(REPO_ROOT, GOLDEN_FILE), count: golden.count, batches: golden.batches.length }));
    return;
  }
  const golden = await readJson(GOLDEN_FILE);
  const report = measure(golden);
  console.log(`golden rows: ${report.rows} (rejected excluded: ${report.excluded_rejected})\n`);
  console.log("field accuracy of crawler output");
  for (const f of report.fields) console.log(`  ${f.field.padEnd(30)} ${String(f.accuracy).padStart(5)}%  (${f.correct}/${f.total})`);
  console.log("\nknown error patterns");
  for (const p of report.patterns) console.log(`  ${String(p.rate).padStart(5)}%  ${p.count.toString().padStart(3)}  ${p.pattern}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
