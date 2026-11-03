// Offline dry-run for home v5 card facts.
//
//   node src/audit-card-facts.js --input <snapshot.jsonl> --out <report.json> [--seed 20261103] [--examples 40]
//
// Reads a local JSONL export of posters, runs the pure extractors in
// poster-card-facts.js and writes a report. No database client, no apply mode.

import fs from "node:fs/promises";
import path from "node:path";

import { buildCardFacts, CARD_FACTS_VERSION } from "./poster-card-facts.js";

export function parseArgs(argv) {
  const args = { input: null, out: null, seed: 20261103, examples: 40, now: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--input") args.input = next();
    else if (arg.startsWith("--input=")) args.input = arg.slice(8);
    else if (arg === "--out") args.out = next();
    else if (arg.startsWith("--out=")) args.out = arg.slice(6);
    else if (arg === "--seed") args.seed = Number(next());
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7));
    else if (arg === "--examples") args.examples = Number(next());
    else if (arg.startsWith("--examples=")) args.examples = Number(arg.slice(11));
    else if (arg === "--now") args.now = next();
    else if (arg.startsWith("--now=")) args.now = arg.slice(6);
    else if (arg === "--apply") throw new Error("audit-card-facts is read-only: there is no --apply mode");
  }
  return args;
}

export async function readJsonl(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`line ${index + 1}: ${error.message}`);
      }
    });
}

export function sourceLabel(row) {
  return row.source_institution_name ?? row.source_org_name ?? "(unknown)";
}

// Deterministic PRNG so repeated runs pick the same spot-check sample.
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample(items, count, seed) {
  const random = mulberry32(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, count);
}

function increment(object, key, by = 1) {
  object[key] = (object[key] ?? 0) + by;
}

export function auditRows(rows, { now = new Date() } = {}) {
  const results = rows.map((row) => {
    const facts = buildCardFacts(row, { now });
    return {
      id: row.id,
      source: sourceLabel(row),
      title: row.title,
      benefit: facts.benefit,
      benefitReason: facts.benefitReason,
      schedule: { kind: facts.schedule.kind, issues: facts.schedule.issues },
      event: { start: row.event_start_at ?? null, end: row.event_end_at ?? null },
      application: { start: row.application_start_at ?? null, end: row.application_end_at ?? null },
      organizer: facts.organizer,
      existingOrganizerName: row.organizer_name ?? null,
      regionBasis: facts.regionBasis,
      columns: facts.columns,
    };
  });

  const bySource = new Map();
  const total = { source: "TOTAL", n: 0, benefit: {}, benefitConflicts: 0, schedule: {}, scheduleIssues: {}, organizer: {}, region: {} };
  for (const result of results) {
    if (!bySource.has(result.source)) {
      bySource.set(result.source, { source: result.source, n: 0, benefit: {}, benefitConflicts: 0, schedule: {}, scheduleIssues: {}, organizer: {}, region: {} });
    }
    for (const bucket of [bySource.get(result.source), total]) {
      bucket.n += 1;
      if (result.benefit) increment(bucket.benefit, result.benefit.kind);
      if (/^conflict/.test(result.benefitReason)) bucket.benefitConflicts += 1;
      increment(bucket.schedule, result.schedule.kind);
      for (const issue of result.schedule.issues) increment(bucket.scheduleIssues, issue);
      increment(bucket.organizer, result.organizer?.basis ?? "none");
      for (const region of result.regionBasis) increment(bucket.region, region.basis);
    }
  }
  const sources = [...bySource.values()].sort((a, b) => b.n - a.n);
  return { results, sources, total };
}

function formatCounts(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([key, value]) => `${key}:${value}`).join(" ") : "-";
}

export function formatTable({ sources, total }, { minRows = 3 } = {}) {
  const lines = [];
  const header = ["source", "n", "benefit(kind)", "conflict", "schedule", "schedule issues", "organizer basis", "region basis"];
  lines.push(header.join(" | "));
  lines.push(header.map(() => "---").join(" | "));
  const small = { source: `(other sources < ${minRows} rows)`, n: 0, benefit: {}, benefitConflicts: 0, schedule: {}, scheduleIssues: {}, organizer: {}, region: {} };
  const row = (bucket) => {
    const found = Object.values(bucket.benefit).reduce((sum, value) => sum + value, 0);
    return [
      bucket.source,
      bucket.n,
      `${found} (${formatCounts(bucket.benefit)})`,
      bucket.benefitConflicts,
      formatCounts(bucket.schedule),
      formatCounts(bucket.scheduleIssues),
      formatCounts(bucket.organizer),
      formatCounts(bucket.region),
    ].join(" | ");
  };
  for (const bucket of sources) {
    if (bucket.n >= minRows) {
      lines.push(row(bucket));
      continue;
    }
    small.n += bucket.n;
    small.benefitConflicts += bucket.benefitConflicts;
    for (const key of ["benefit", "schedule", "scheduleIssues", "organizer", "region"]) {
      for (const [name, value] of Object.entries(bucket[key])) increment(small[key], name, value);
    }
  }
  if (small.n > 0) lines.push(row(small));
  lines.push(row(total));
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.out) {
    console.error("usage: node src/audit-card-facts.js --input <snapshot.jsonl> --out <report.json> [--seed N] [--examples 40]");
    process.exit(1);
  }
  const now = args.now ? new Date(args.now) : new Date();
  const rows = await readJsonl(args.input);
  const audit = auditRows(rows, { now });
  const withBenefit = audit.results.filter((result) => result.benefit);
  const examples = sample(audit.results, args.examples, args.seed);
  const benefitSpotCheck = sample(withBenefit, Math.min(60, withBenefit.length), args.seed + 1);

  const report = {
    version: CARD_FACTS_VERSION,
    generatedAt: new Date().toISOString(),
    now: now.toISOString(),
    input: path.basename(args.input),
    mode: "dry-run (offline, no database)",
    totals: audit.total,
    sources: audit.sources,
    examples,
    benefitSpotCheck,
    results: audit.results,
  };
  await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`card facts dry-run (${CARD_FACTS_VERSION}) over ${rows.length} posters`);
  console.log(formatTable(audit));
  console.log(`\nreport: ${args.out}`);
}

const isDirectExecution = Boolean(process.argv[1] && path.basename(process.argv[1]) === "audit-card-facts.js");
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
