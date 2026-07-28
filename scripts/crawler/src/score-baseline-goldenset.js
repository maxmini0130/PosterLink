#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_INPUT = "data/baseline/goldenset_sample.csv";
const DEFAULT_OUTPUT = "data/baseline/baseline_report.json";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/score-baseline-goldenset.js [--input=data/baseline/goldenset_sample.csv] [--output=data/baseline/baseline_report.json]

Gold labels:
  1 = correct / yes
  0 = incorrect / no
  blank = exclude from that metric`);
  process.exit(0);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  const [header, ...body] = rows.filter((items) => items.some((value) => value !== ""));
  return body.map((items) => Object.fromEntries(header.map((key, index) => [key.replace(/^\uFEFF/, ""), items[index] ?? ""])));
}

function normalizeGold(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "y", "yes", "true", "ok", "correct"].includes(text)) return true;
  if (["0", "n", "no", "false", "x", "incorrect"].includes(text)) return false;
  return null;
}

function scoreMetric(rows, key) {
  const labeled = rows
    .map((row) => normalizeGold(row[key]))
    .filter((value) => value !== null);
  const correct = labeled.filter(Boolean).length;
  return {
    labeled: labeled.length,
    correct,
    incorrect: labeled.length - correct,
    accuracy: labeled.length > 0 ? correct / labeled.length : null,
  };
}

function formatPercent(value) {
  return value === null ? "n/a" : `${Math.round(value * 1000) / 10}%`;
}

async function main() {
  const input = path.resolve(REPO_ROOT, args.input || DEFAULT_INPUT);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const rows = parseCsv(await fs.readFile(input, "utf-8"));

  const metrics = {
    poster_relevance: scoreMetric(rows, "gold_is_valid_poster"),
    title_extraction: scoreMetric(rows, "gold_title_ok"),
    org_extraction: scoreMetric(rows, "gold_org_ok"),
    deadline_extraction: scoreMetric(rows, "gold_deadline_ok"),
    category_classification: scoreMetric(rows, "gold_category_ok"),
    duplicate_decision: scoreMetric(rows, "gold_duplicate_ok"),
  };
  const labeledMetrics = Object.values(metrics).filter((metric) => metric.labeled > 0);
  const macroAccuracy = labeledMetrics.length > 0
    ? labeledMetrics.reduce((sum, metric) => sum + metric.accuracy, 0) / labeledMetrics.length
    : null;

  const report = {
    generated_at: new Date().toISOString(),
    input,
    rows: rows.length,
    labeled_rows: rows.filter((row) => Object.keys(row).some((key) => key.startsWith("gold_") && normalizeGold(row[key]) !== null)).length,
    macro_accuracy: macroAccuracy,
    metrics,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    ...report,
    macro_accuracy_label: formatPercent(macroAccuracy),
    metric_labels: Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, formatPercent(value.accuracy)])),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
