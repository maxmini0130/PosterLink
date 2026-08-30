#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { decidePosterDetection, extractPosterSignals } from "./poster-detection-signals.js";

const DEFAULT_SET = "eval/golden";
const DEFAULT_OUT = `data/eval/reports/poster-detection-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
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
  node src/measure-poster-detection.js [--set=eval/golden] [--limit=554] [--out=data/eval/reports/<timestamp>.json]

Measures poster detection rule/VLM routing quality on golden-set labels.
Outputs precision/recall for is_real_poster rule predictions and VLM deferral share.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
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

function normalizeBooleanTruth(value) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "y", "yes", "poster", "recruit", "positive"].includes(text)) return true;
  if (["false", "0", "n", "no", "not_poster", "non_poster", "negative"].includes(text)) return false;
  return null;
}

function normalizeGolden(raw, file) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const truthCandidate = raw.items && Array.isArray(raw.items) ? raw.items : [raw];
  return truthCandidate
    .filter((item) => item?.poster_id || item?.posterId)
    .map((item) => ({
      ...item,
      poster_id: item.poster_id ?? item.posterId,
      source_file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
      truth_is_real_poster: normalizeBooleanTruth(item.truth?.is_real_poster),
    }))
    .filter((item) => item.truth_is_real_poster !== null && Object.keys(item.truth ?? {}).includes("is_real_poster"));
}

async function readGoldenSet(setPath) {
  const absoluteSet = path.resolve(REPO_ROOT, setPath);
  const files = await listJsonFiles(absoluteSet).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const items = [];
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    items.push(...normalizeGolden(raw, file));
  }
  return { files, items };
}

function posterImageOcr(row) {
  const fieldVerification = row.field_verification;
  return fieldVerification && typeof fieldVerification === "object" && typeof fieldVerification.posterImageOcr === "object"
    ? fieldVerification.posterImageOcr
    : {};
}

function compact(value, limit = 6000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

async function fetchPosters(supabase, posterIds) {
  if (posterIds.length === 0) return [];
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,summary_short,summary_long,field_verification")
    .in("id", posterIds);
  if (error) throw error;
  return data ?? [];
}

async function fetchImages(supabase, posterIds) {
  const byPoster = new Map();
  if (posterIds.length === 0) return byPoster;
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("poster_images")
      .select("poster_id,storage_path,image_type,width,height,created_at")
      .in("poster_id", chunk);
    if (error) throw error;
    for (const image of data ?? []) {
      const list = byPoster.get(image.poster_id) ?? [];
      list.push(image);
      byPoster.set(image.poster_id, list);
    }
  }
  return byPoster;
}

function selectImage(row, images) {
  if (!images || images.length === 0) return null;
  return (
    images.find((image) => image.image_type === "thumbnail") ??
    images[0]
  );
}

function computePosterDetectionMetrics(plans = []) {
  const counts = {
    total: plans.length,
    classified: 0,
    abstained: 0,
    correct: 0,
    tp: 0,
    fp: 0,
    tn: 0,
    fn: 0,
    truth_positive: 0,
    truth_negative: 0,
    needs_vlm: 0,
    byRoute: {},
  };
  let routeTotal = 0;

  for (const plan of plans) {
    const route = plan.decision.route;
    counts.byRoute[route] = (counts.byRoute[route] ?? 0) + 1;
    routeTotal += 1;
    if (plan.decision.needsVlm) counts.needs_vlm += 1;

    if (plan.truth_is_real_poster) counts.truth_positive += 1;
    else counts.truth_negative += 1;

    if (plan.decision.isRealPoster === null) {
      counts.abstained += 1;
      if (plan.truth_is_real_poster) counts.fn += 1;
      continue;
    }

    counts.classified += 1;
    const predicted = plan.decision.isRealPoster;
    const truth = plan.truth_is_real_poster;
    const isCorrect = predicted === truth;
    if (isCorrect) counts.correct += 1;

    if (predicted && truth) counts.tp += 1;
    else if (predicted && !truth) counts.fp += 1;
    else if (!predicted && truth) counts.fn += 1;
    else counts.tn += 1;
  }

  const routeCoverage = routeTotal > 0 ? counts.classified / routeTotal : 0;
  const vlmSavingsRate = counts.total > 0 ? 1 - counts.needs_vlm / counts.total : 0;
  const routeStats = Object.fromEntries(
    Object.entries(counts.byRoute).sort((a, b) => b[1] - a[1]),
  );

  return {
    ...counts,
    precision: counts.tp + counts.fp > 0 ? counts.tp / (counts.tp + counts.fp) : null,
    recall: counts.tp + counts.fn > 0 ? counts.tp / (counts.tp + counts.fn) : null,
    recall_by_route:
      counts.truth_positive > 0
        ? counts.tp / counts.truth_positive
        : null,
    precision_by_coverage: routeCoverage,
    vlm_savings_rate: vlmSavingsRate,
    routeStats,
  };
}

export function evaluatePosterDetectionPlan(plans = []) {
  return computePosterDetectionMetrics(plans);
}

async function main() {
  const setPath = args.set || DEFAULT_SET;
  const output = path.resolve(REPO_ROOT, args.out || DEFAULT_OUT);
  const limit = Math.max(1, Number(args.limit || 0));

  const { files, items } = await readGoldenSet(setPath);
  if (items.length === 0) {
    const report = {
      generated_at: new Date().toISOString(),
      set: path.resolve(REPO_ROOT, setPath),
      mode: "dry-run",
      file_count: files.length,
      labeled_items: 0,
      note: "No labeled is_real_poster item found in golden set.",
    };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const supabase = createSupabase();
  const uniquePosterIds = Array.from(new Set(items.map((item) => item.poster_id)));
  const limitedIds = limit > 0 ? uniquePosterIds.slice(0, limit) : uniquePosterIds;
  const posters = await fetchPosters(supabase, limitedIds);
  const imagesByPoster = await fetchImages(supabase, posters.map((poster) => poster.id));
  const goldenByPoster = new Map(items.map((item) => [item.poster_id, item]));

  const plans = posters
    .map((poster) => {
      const record = goldenByPoster.get(poster.id);
      if (!record) return null;
      const images = imagesByPoster.get(poster.id) ?? [];
      const selectedImage = selectImage(poster, images);
      const ocr = posterImageOcr(poster);
      const signals = extractPosterSignals({
        width: selectedImage?.width,
        height: selectedImage?.height,
        title: poster.title,
        ocrText: ocr?.ocrText ?? ocr?.text ?? "",
        sourceText: compact([poster.summary_short, poster.summary_long].filter(Boolean).join("\n")),
        imageClassification: ocr?.imageClassification ?? null,
      });
      const decision = decidePosterDetection(signals);
      return {
        poster_id: poster.id,
        title: poster.title,
        truth_is_real_poster: record.truth_is_real_poster,
        decision,
        signals,
      };
    })
    .filter(Boolean);

  const metrics = evaluatePosterDetectionPlan(plans);
  const report = {
    generated_at: new Date().toISOString(),
    set: path.resolve(REPO_ROOT, setPath),
    file_count: files.length,
    labeled_items: items.length,
    evaluated_items: plans.length,
    ...metrics,
    plans,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    generated_at: report.generated_at,
    labeled_items: report.labeled_items,
    evaluated_items: report.evaluated_items,
    total: metrics.total,
    classified: metrics.classified,
    abstained: metrics.abstained,
    needs_vlm: metrics.needs_vlm,
    precision: metrics.precision,
    recall: metrics.recall,
    recall_by_route: metrics.recall_by_route,
    vlm_savings_rate: metrics.vlm_savings_rate,
    routes: metrics.routeStats,
  }, null, 2));
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
