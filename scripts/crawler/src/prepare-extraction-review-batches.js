#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIELD_IMPORTANCE } from "./extraction-eval.js";

const DEFAULT_INPUT = "data/eval/extraction-golden-seed.json";
const DEFAULT_OUTPUT_DIR = "data/eval/review-batches";
const DEFAULT_BATCH_SIZE = 20;
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
  node src/prepare-extraction-review-batches.js [--input=data/eval/extraction-golden-seed.json] [--output-dir=data/eval/review-batches] [--batch-size=20]

Splits a Phase 2 extraction golden seed into reviewer-sized JSON batches and an
index CSV. Reviewers should verify original sources, fill only checked truth
fields, then move completed JSON files under eval/golden/.`);
  process.exit(0);
}

const FIELD_ORDER = Object.freeze([
  "is_real_poster",
  "deadline_date",
  "deadline_type",
  "host_org",
  "official_url",
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

function resolveRepoPath(value) {
  return path.resolve(REPO_ROOT, value);
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function compact(value, limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function predictionFromEvidence(row) {
  if (!row) return null;
  const json = row.value_json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (json.date !== undefined) return json.date;
    if (json.url !== undefined) return json.url;
    if (json.name !== undefined) return json.name;
    if (json.type !== undefined) return json.type;
    if (json.min !== undefined) return json.min;
    if (json.max !== undefined) return json.max;
    if (json.value !== undefined) return json.value;
  }
  return row.value_text ?? null;
}

function makeReviewFields(currentEvidence = {}) {
  return Object.fromEntries(
    FIELD_ORDER.map((fieldKey) => {
      const evidence = currentEvidence[fieldKey] ?? null;
      return [
        fieldKey,
        {
          importance: FIELD_IMPORTANCE[fieldKey],
          current_prediction: predictionFromEvidence(evidence),
          confidence: evidence?.confidence ?? null,
          evidence_text: evidence?.evidence_text ?? null,
          evidence_src: evidence?.evidence_src ?? null,
          extractor: evidence?.extractor ?? null,
          truth: "__FILL_AFTER_SOURCE_REVIEW_OR_OMIT__",
        },
      ];
    }),
  );
}

function makeReviewItem(item) {
  return {
    poster_id: item.poster_id,
    labeled_by: item.labeled_by ?? "",
    labeled_at: item.labeled_at ?? "",
    context: item.context ?? {},
    review_fields: makeReviewFields(item.current_evidence ?? {}),
    truth: item.truth ?? {},
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const inputPath = resolveRepoPath(args.input || DEFAULT_INPUT);
  const outputDir = resolveRepoPath(args["output-dir"] || DEFAULT_OUTPUT_DIR);
  const batchSize = Math.max(1, Number(args["batch-size"] || DEFAULT_BATCH_SIZE));
  const seed = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const items = Array.isArray(seed.items) ? seed.items : [];

  if (items.length === 0) {
    throw new Error(`No seed items found in ${inputPath}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const indexRows = [[
    "batch",
    "row",
    "poster_id",
    "status",
    "title",
    "source_org",
    "source_url",
    "evidence_fields",
  ]];
  const batches = [];

  for (let start = 0; start < items.length; start += batchSize) {
    const batchNumber = Math.floor(start / batchSize) + 1;
    const batchItems = items.slice(start, start + batchSize).map(makeReviewItem);
    const batchFileName = `batch-${String(batchNumber).padStart(2, "0")}.json`;
    const batchPath = path.join(outputDir, batchFileName);
    const batch = {
      generated_at: new Date().toISOString(),
      source_seed: path.relative(REPO_ROOT, inputPath).replace(/\\/g, "/"),
      instructions: [
        "Open context.source_key and verify each field against the original source.",
        "Move checked values from review_fields.<field>.truth into truth.<field>.",
        "Set truth.<field> to null only when the field was checked and confirmed absent.",
        "Omit unreviewed fields from truth.",
        "When complete, copy the reviewed JSON file under eval/golden/ before scoring.",
      ],
      items: batchItems,
    };
    await writeJson(batchPath, batch);
    batches.push({
      file: path.relative(REPO_ROOT, batchPath).replace(/\\/g, "/"),
      items: batchItems.length,
    });

    batchItems.forEach((item, index) => {
      indexRows.push([
        batchFileName,
        String(index + 1),
        item.poster_id,
        item.context.poster_status,
        compact(item.context.title),
        item.context.source_org_name,
        item.context.source_key,
        String(Object.keys(item.review_fields).filter((fieldKey) => (
          item.review_fields[fieldKey].current_prediction !== null
        )).length),
      ]);
    });
  }

  const indexCsv = indexRows.map((row) => row.map(csvCell).join(",")).join("\n");
  await fs.writeFile(path.join(outputDir, "index.csv"), `${indexCsv}\n`, "utf8");
  await writeJson(path.join(outputDir, "summary.json"), {
    generated_at: new Date().toISOString(),
    input: path.relative(REPO_ROOT, inputPath).replace(/\\/g, "/"),
    output_dir: path.relative(REPO_ROOT, outputDir).replace(/\\/g, "/"),
    total_items: items.length,
    batch_size: batchSize,
    batch_count: batches.length,
    batches,
  });

  console.log(JSON.stringify({
    output_dir: outputDir,
    total_items: items.length,
    batch_size: batchSize,
    batch_count: batches.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
