#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  buildPosterDetectionEvidence,
  decidePosterDetection,
  extractPosterSignals,
} from "./poster-detection-signals.js";
import { probeImage } from "./poster-image-rules.js";

const DEFAULT_OUTPUT = "data/results/poster-detection-evidence-dryrun.json";
const DEFAULT_LIMIT = 5000;
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
  node src/backfill-poster-detection-evidence.js [--limit=5000] [--statuses=published,review] [--output=data/results/poster-detection-evidence-dryrun.json] [--apply] [--probe-missing-dimensions] [--probe-limit=0] [--include-negative]

Builds poster_field_evidence.is_real_poster rows from cheap geometry/text
signals and existing imageClassification results. Dry-run is the default.
--apply upserts only poster_field_evidence rows; it does not change poster_status
or exposure_tier.

--probe-missing-dimensions fetches image headers when poster_images has no
width/height. --probe-limit caps network probes; 0 means no cap.

Negative is_real_poster=false evidence is excluded by default. Add
--include-negative only after manual review of the false candidates.`);
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

function compact(value, limit = 6000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function posterImageOcr(row) {
  return row.field_verification?.posterImageOcr && typeof row.field_verification.posterImageOcr === "object"
    ? row.field_verification.posterImageOcr
    : {};
}

function imageClassification(row) {
  const ocr = posterImageOcr(row);
  return ocr.imageClassification && typeof ocr.imageClassification === "object"
    ? ocr.imageClassification
    : null;
}

function ocrText(row) {
  const ocr = posterImageOcr(row);
  return ocr.ocrText ?? ocr.text ?? "";
}

async function fetchPosters(supabase, statuses, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,thumbnail_url,summary_short,summary_long,field_verification,created_at")
      .in("poster_status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function fetchImages(supabase, posterIds) {
  const byPoster = new Map();
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
    images.find((image) => image.image_type === "thumbnail" && image.storage_path === row.thumbnail_url) ??
    images.find((image) => image.image_type === "thumbnail") ??
    images[0]
  );
}

async function resolveImageDimensions(selectedImage, options) {
  if (!selectedImage || !options.probeMissingDimensions) return selectedImage;
  if (selectedImage.width && selectedImage.height) return selectedImage;
  if (options.probeLimit > 0 && options.probeCount.count >= options.probeLimit) {
    return selectedImage;
  }
  options.probeCount.count += 1;

  try {
    const probe = await probeImage(selectedImage.storage_path);
    if (!probe?.dimensions) return {
      ...selectedImage,
      probe_error: null,
      probe_content_type: probe?.contentType ?? null,
      probe_content_length: probe?.contentLength ?? null,
    };
    return {
      ...selectedImage,
      width: selectedImage.width ?? probe.dimensions.width,
      height: selectedImage.height ?? probe.dimensions.height,
      probe_content_type: probe.contentType,
      probe_content_length: probe.contentLength,
      probe_dimensions: probe.dimensions,
    };
  } catch (error) {
    return {
      ...selectedImage,
      probe_error: error.message,
    };
  }
}

async function buildPlan(row, images, options) {
  const selectedImage = selectImage(row, images);
  let resolvedImage = selectedImage;
  let signals = extractPosterSignals({
    width: selectedImage?.width,
    height: selectedImage?.height,
    title: row.title,
    ocrText: ocrText(row),
    sourceText: compact([row.summary_short, row.summary_long].filter(Boolean).join("\n")),
    imageClassification: imageClassification(row),
  });
  let decision = decidePosterDetection(signals);

  if (decision.needsVlm && selectedImage && (!selectedImage.width || !selectedImage.height)) {
    resolvedImage = await resolveImageDimensions(selectedImage, options);
    if (resolvedImage !== selectedImage) {
      signals = extractPosterSignals({
        width: resolvedImage?.width,
        height: resolvedImage?.height,
        title: row.title,
        ocrText: ocrText(row),
        sourceText: compact([row.summary_short, row.summary_long].filter(Boolean).join("\n")),
        imageClassification: imageClassification(row),
      });
      decision = decidePosterDetection(signals);
    }
  }

  const evidence = decision.isRealPoster === false && !options.includeNegative
    ? null
    : buildPosterDetectionEvidence({
        posterId: row.id,
        signals,
        decision,
      });
  return {
    id: row.id,
    title: row.title,
    poster_status: row.poster_status,
    thumbnail_url: row.thumbnail_url,
    selected_image: resolvedImage,
    signals,
    decision,
    evidence_skipped_reason: decision.isRealPoster === false && !options.includeNegative
      ? "negative_evidence_requires_include_negative"
      : null,
    evidence,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function applyEvidenceRows(supabase, rows) {
  const results = [];
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = await supabase
      .from("poster_field_evidence")
      .upsert(chunk, { onConflict: "poster_id,field_key,extractor" });
    results.push({
      index,
      count: chunk.length,
      status: error ? "failed" : "applied",
      error: error?.message ?? null,
    });
    if (error) console.error(`[poster-detection] upsert failed: ${error.message}`);
  }
  return results;
}

function summarize(plans) {
  const routes = {};
  const decisions = { true: 0, false: 0, ambiguous: 0 };
  let needsVlm = 0;
  for (const plan of plans) {
    routes[plan.decision.route] = (routes[plan.decision.route] ?? 0) + 1;
    if (plan.decision.needsVlm) needsVlm += 1;
    if (plan.decision.isRealPoster === true) decisions.true += 1;
    else if (plan.decision.isRealPoster === false) decisions.false += 1;
    else decisions.ambiguous += 1;
  }
  return { routes, decisions, needsVlm };
}

async function main() {
  const supabase = createSupabase();
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const statuses = String(args.statuses || "published,review")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const probeOptions = {
    probeMissingDimensions: Boolean(args["probe-missing-dimensions"]),
    probeLimit: Math.max(0, Number(args["probe-limit"] || 0)),
    probeCount: { count: 0 },
    includeNegative: Boolean(args["include-negative"]),
  };

  const posters = await fetchPosters(supabase, statuses, limit);
  const imagesByPoster = await fetchImages(supabase, posters.map((poster) => poster.id));
  const plans = await mapWithConcurrency(
    posters,
    8,
    (poster) => buildPlan(poster, imagesByPoster.get(poster.id) ?? [], probeOptions),
  );
  const evidenceRows = plans.map((plan) => plan.evidence).filter(Boolean);
  const results = apply ? await applyEvidenceRows(supabase, evidenceRows) : [];
  const summary = summarize(plans);

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    checked_count: posters.length,
    evidence_row_count: evidenceRows.length,
    include_negative: probeOptions.includeNegative,
    probed_image_count: probeOptions.probeCount.count,
    ...summary,
    applied_count: results
      .filter((result) => result.status === "applied")
      .reduce((sum, result) => sum + result.count, 0),
    failed_count: results.filter((result) => result.status === "failed").length,
    plans,
    results,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    mode: report.mode,
    checked_count: report.checked_count,
    evidence_row_count: report.evidence_row_count,
    decisions: report.decisions,
    routes: report.routes,
    needsVlm: report.needsVlm,
    probed_image_count: probeOptions.probeCount.count,
    applied_count: report.applied_count,
    failed_count: report.failed_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
