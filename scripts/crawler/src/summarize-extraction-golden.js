#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIELD_IMPORTANCE } from "./extraction-eval.js";

const DEFAULT_SET = "eval/golden";
const DEFAULT_REVIEW_DIR = "data/eval/review-batches-20260825";
const DEFAULT_SEED = "data/eval/extraction-golden-seed-20260825-stratified.json";
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
  node src/summarize-extraction-golden.js [--set=eval/golden] [--review-dir=data/eval/review-batches-20260825] [--seed=data/eval/extraction-golden-seed-20260825-stratified.json]

Summarizes Phase 2 golden-label progress without reading or writing the
operating database.`);
  process.exit(0);
}

const KNOWN_FIELDS = Object.keys(FIELD_IMPORTANCE);

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function normalizeItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Array.isArray(raw.items) ? raw.items : [raw];
}

function countBy(items, pickKey) {
  const counts = {};
  for (const item of items) {
    const key = String(pickKey(item) ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function summarizeTruth(items) {
  const fieldCounts = Object.fromEntries(KNOWN_FIELDS.map((fieldKey) => [fieldKey, 0]));
  let truthFieldCount = 0;
  let labeledItems = 0;
  const labeledPosterIds = new Set();
  const emptyPosterIds = [];

  for (const item of items) {
    const truth = item?.truth && typeof item.truth === "object" && !Array.isArray(item.truth)
      ? item.truth
      : {};
    const truthKeys = Object.keys(truth);
    if (truthKeys.length > 0) {
      labeledItems += 1;
      if (item.poster_id || item.posterId) labeledPosterIds.add(item.poster_id ?? item.posterId);
    } else if (item.poster_id || item.posterId) {
      emptyPosterIds.push(item.poster_id ?? item.posterId);
    }

    for (const fieldKey of truthKeys) {
      truthFieldCount += 1;
      if (fieldKey in fieldCounts) fieldCounts[fieldKey] += 1;
    }
  }

  return {
    labeled_items: labeledItems,
    labeled_unique_posters: labeledPosterIds.size,
    truth_field_count: truthFieldCount,
    field_counts: fieldCounts,
    least_labeled_fields: Object.entries(fieldCounts)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([field_key, count]) => ({ field_key, count, importance: FIELD_IMPORTANCE[field_key] })),
    empty_poster_ids: emptyPosterIds.slice(0, 20),
  };
}

async function readGoldenItems(setPath) {
  const files = await listJsonFiles(setPath);
  const items = [];
  for (const file of files) {
    items.push(...normalizeItems(await readJsonIfExists(file)));
  }
  return { files, items };
}

async function readReviewItems(reviewDir) {
  const files = (await listJsonFiles(reviewDir)).filter((file) => !file.endsWith("summary.json"));
  const items = [];
  for (const file of files) {
    items.push(...normalizeItems(await readJsonIfExists(file)));
  }
  return { files, items };
}

async function main() {
  const setPath = path.resolve(REPO_ROOT, args.set || DEFAULT_SET);
  const reviewDir = path.resolve(REPO_ROOT, args["review-dir"] || DEFAULT_REVIEW_DIR);
  const seedPath = path.resolve(REPO_ROOT, args.seed || DEFAULT_SEED);

  const [seed, golden, review] = await Promise.all([
    readJsonIfExists(seedPath),
    readGoldenItems(setPath),
    readReviewItems(reviewDir),
  ]);

  const seedItems = normalizeItems(seed);
  const goldenSummary = summarizeTruth(golden.items);
  const reviewSummary = summarizeTruth(review.items);
  const targetItems = seedItems.length || review.items.length || 120;
  const remainingItems = Math.max(0, targetItems - goldenSummary.labeled_unique_posters);

  const report = {
    generated_at: new Date().toISOString(),
    target_items: targetItems,
    remaining_items: remainingItems,
    completion_ratio: targetItems > 0 ? goldenSummary.labeled_unique_posters / targetItems : null,
    seed: {
      path: path.relative(REPO_ROOT, seedPath).replace(/\\/g, "/"),
      exists: Boolean(seed),
      items: seedItems.length,
      buckets: seed?.sample_buckets ?? countBy(seedItems, (item) => item?.context?.sample_bucket),
    },
    review_batches: {
      path: path.relative(REPO_ROOT, reviewDir).replace(/\\/g, "/"),
      files: review.files.length,
      items: review.items.length,
      sample_buckets: countBy(review.items, (item) => item?.context?.sample_bucket),
      ...reviewSummary,
    },
    golden_set: {
      path: path.relative(REPO_ROOT, setPath).replace(/\\/g, "/"),
      files: golden.files.length,
      items: golden.items.length,
      ...goldenSummary,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
