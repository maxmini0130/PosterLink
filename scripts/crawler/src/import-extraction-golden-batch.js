#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_INPUT = "data/eval/review-batches-20260825/batch-01.json";
const DEFAULT_OUTPUT_DIR = "eval/golden";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const PLACEHOLDER_PATTERN = /__FILL_AFTER_SOURCE_REVIEW/i;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/import-extraction-golden-batch.js [--input=data/eval/review-batches-20260825/batch-01.json] [--output-dir=eval/golden] [--labeled-by=max] [--labeled-at=2026-08-25] [--require-complete] [--apply]

Imports completed Phase 2 review batch items into git-managed eval/golden JSON
files. Dry-run is the default. Only items with non-empty top-level truth objects
are imported; review_fields placeholders are never copied.`);
  process.exit(0);
}

function resolveRepoPath(value) {
  return path.resolve(REPO_ROOT, value);
}

function todayKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function normalizeItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Array.isArray(raw.items) ? raw.items : [raw];
}

function cleanTruth(truth) {
  if (!truth || typeof truth !== "object" || Array.isArray(truth)) return {};
  return Object.fromEntries(
    Object.entries(truth).filter(([, value]) => (
      !(typeof value === "string" && PLACEHOLDER_PATTERN.test(value))
    )),
  );
}

function goldenFileName(posterId) {
  return `${String(posterId).replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

export function buildGoldenImportPlan(rawBatch, {
  defaultLabeledBy = "",
  defaultLabeledAt = todayKst(),
  sourceBatch = null,
  requireComplete = false,
} = {}) {
  const items = normalizeItems(rawBatch);
  const goldenItems = [];
  const skipped = [];
  const errors = [];

  items.forEach((item, index) => {
    const posterId = item?.poster_id ?? item?.posterId ?? null;
    const location = `items[${index}]`;
    if (!posterId) {
      errors.push(`${location}: missing poster_id`);
      return;
    }

    const truth = cleanTruth(item.truth);
    if (Object.keys(truth).length === 0) {
      skipped.push({ poster_id: posterId, reason: "empty_truth" });
      if (requireComplete) errors.push(`${location}: truth is empty`);
      return;
    }

    goldenItems.push({
      poster_id: posterId,
      labeled_by: item.labeled_by || defaultLabeledBy,
      labeled_at: item.labeled_at || defaultLabeledAt,
      truth,
      notes: item.notes ?? undefined,
      source_review_batch: sourceBatch ?? rawBatch?.source_seed ?? null,
      context_title: item.context?.title ?? undefined,
      context_source_url: item.context?.source_key ?? undefined,
    });
  });

  return {
    total_items: items.length,
    importable_items: goldenItems.length,
    skipped_items: skipped.length,
    goldenItems,
    skipped,
    errors,
    ok: errors.length === 0,
  };
}

async function writeGoldenItems(items, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const written = [];
  for (const item of items) {
    const filePath = path.join(outputDir, goldenFileName(item.poster_id));
    await fs.writeFile(filePath, `${JSON.stringify(item, null, 2)}\n`, "utf8");
    written.push(path.relative(REPO_ROOT, filePath).replace(/\\/g, "/"));
  }
  return written;
}

async function main() {
  const inputPath = resolveRepoPath(args.input || DEFAULT_INPUT);
  const outputDir = resolveRepoPath(args["output-dir"] || DEFAULT_OUTPUT_DIR);
  const apply = Boolean(args.apply);
  const rawBatch = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const plan = buildGoldenImportPlan(rawBatch, {
    defaultLabeledBy: args["labeled-by"] || "",
    defaultLabeledAt: args["labeled-at"] || todayKst(),
    sourceBatch: path.relative(REPO_ROOT, inputPath).replace(/\\/g, "/"),
    requireComplete: Boolean(args["require-complete"]),
  });

  const written = apply && plan.ok
    ? await writeGoldenItems(plan.goldenItems, outputDir)
    : [];

  const report = {
    input: path.relative(REPO_ROOT, inputPath).replace(/\\/g, "/"),
    output_dir: path.relative(REPO_ROOT, outputDir).replace(/\\/g, "/"),
    mode: apply ? "apply" : "dry-run",
    total_items: plan.total_items,
    importable_items: plan.importable_items,
    skipped_items: plan.skipped_items,
    written_files: written,
    skipped: plan.skipped.slice(0, 20),
    errors: plan.errors,
    ok: plan.ok,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!plan.ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
