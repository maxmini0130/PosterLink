#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_INPUT = "data/eval/review-batches-20260825/batch-01.json";
const DEFAULT_OUTPUT = "data/eval/review-batches-20260825/batch-01-review.md";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const CRITICAL_FIELDS = Object.freeze([
  "is_real_poster",
  "content_type",
  "deadline_date",
  "deadline_type",
  "host_org",
  "official_url",
]);

const OPTIONAL_FIELDS = Object.freeze([
  "apply_start",
  "category",
  "region",
  "age_min",
  "age_max",
  "target_desc",
  "benefit",
  "apply_method",
  "apply_url",
  "cost",
  "contact",
  "capacity",
  "venue",
]);

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/create-extraction-review-sheet.js [--input=data/eval/review-batches-20260825/batch-01.json] [--output=data/eval/review-batches-20260825/batch-01-review.md]

Creates a human-readable Markdown review sheet for a Phase 2 extraction review
batch. This is a local working artifact; reviewed truth still belongs in the
batch JSON top-level truth object before import.`);
  process.exit(0);
}

function resolveRepoPath(value) {
  return path.resolve(REPO_ROOT, value);
}

function normalizeItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Array.isArray(raw.items) ? raw.items : [raw];
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value, limit = 260) {
  const chars = Array.from(text(value));
  return chars.length > limit ? `${chars.slice(0, limit - 1).join("")}…` : chars.join("");
}

function escapeTable(value) {
  return text(value).replace(/\|/g, "\\|") || "-";
}

function displayPrediction(field) {
  const value = field?.current_prediction;
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function truthKeys(item) {
  const truth = item?.truth;
  if (!truth || typeof truth !== "object" || Array.isArray(truth)) return [];
  return Object.keys(truth);
}

function fieldLine(fieldKey, field) {
  const confidence = field?.confidence === null || field?.confidence === undefined
    ? "-"
    : Number(field.confidence).toFixed(2);
  const evidence = truncate(field?.evidence_text, 180);
  return `- \`${fieldKey}\`: ${displayPrediction(field)} (confidence ${confidence}, ${field?.extractor ?? "-"})\n  - evidence: ${evidence || "-"}`;
}

export function buildReviewSheet(rawBatch, { sourcePath = "" } = {}) {
  const items = normalizeItems(rawBatch);
  const title = sourcePath || "Phase 2 Review Batch";
  const lines = [
    `# ${title}`,
    "",
    "Open each source URL, verify only fields you actually checked, then write labels into the batch JSON top-level `truth` object.",
    "",
    "Use `null` only when a field was checked and confirmed absent. Omit fields you did not review.",
    "",
    "## Progress",
    "",
    `- Items: ${items.length}`,
    `- Items with truth: ${items.filter((item) => truthKeys(item).length > 0).length}`,
    "",
    "## Index",
    "",
    "| Row | Bucket | Title | Source | Critical Predictions | Truth Fields |",
    "|---:|---|---|---|---|---|",
  ];

  items.forEach((item, index) => {
    const context = item.context ?? {};
    const reviewFields = item.review_fields ?? {};
    const critical = CRITICAL_FIELDS
      .map((fieldKey) => `${fieldKey}=${displayPrediction(reviewFields[fieldKey])}`)
      .join("<br>");
    const sourceUrl = context.source_key
      ? `[open](${context.source_key})`
      : "-";
    const cells = [
      String(index + 1),
      escapeTable(context.sample_bucket),
      escapeTable(context.title),
      sourceUrl,
      escapeTable(critical),
      escapeTable(truthKeys(item).join(", ")),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  });

  lines.push("", "## Items", "");

  items.forEach((item, index) => {
    const context = item.context ?? {};
    const reviewFields = item.review_fields ?? {};
    lines.push(
      `### ${index + 1}. ${context.title ?? item.poster_id}`,
      "",
      `- poster_id: \`${item.poster_id ?? item.posterId ?? "-"}\``,
      `- bucket: ${context.sample_bucket ?? "-"}`,
      `- status/tier: ${context.poster_status ?? "-"} / ${context.exposure_tier ?? "-"}`,
      `- source: ${context.source_key ?? "-"}`,
      `- thumbnail: ${context.thumbnail_url ?? "-"}`,
      `- current application_end_at: ${context.application_end_at ?? "-"}`,
      `- current truth fields: ${truthKeys(item).join(", ") || "-"}`,
      "",
      "Critical fields:",
      "",
      ...CRITICAL_FIELDS.map((fieldKey) => fieldLine(fieldKey, reviewFields[fieldKey])),
      "",
      "Optional fields with predictions:",
      "",
    );

    const optionalWithPredictions = OPTIONAL_FIELDS.filter((fieldKey) => (
      reviewFields[fieldKey]?.current_prediction !== null
      && reviewFields[fieldKey]?.current_prediction !== undefined
    ));
    if (optionalWithPredictions.length === 0) {
      lines.push("- none");
    } else {
      lines.push(...optionalWithPredictions.map((fieldKey) => fieldLine(fieldKey, reviewFields[fieldKey])));
    }

    lines.push(
      "",
      "Source excerpt:",
      "",
      `> ${truncate(context.source_excerpt, 900) || "-"}`,
      "",
      "Suggested JSON edit:",
      "",
      "```json",
      JSON.stringify({
        poster_id: item.poster_id ?? item.posterId ?? "",
        labeled_by: item.labeled_by ?? "",
        labeled_at: item.labeled_at ?? "",
        truth: item.truth ?? {},
      }, null, 2),
      "```",
      "",
    );
  });

  return `${lines.join("\n")}\n`;
}

async function main() {
  const inputPath = resolveRepoPath(args.input || DEFAULT_INPUT);
  const outputPath = resolveRepoPath(args.output || DEFAULT_OUTPUT);
  const rawBatch = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const sheet = buildReviewSheet(rawBatch, {
    sourcePath: path.relative(REPO_ROOT, inputPath).replace(/\\/g, "/"),
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, sheet, "utf8");
  console.log(JSON.stringify({
    input: path.relative(REPO_ROOT, inputPath).replace(/\\/g, "/"),
    output: path.relative(REPO_ROOT, outputPath).replace(/\\/g, "/"),
    items: normalizeItems(rawBatch).length,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
