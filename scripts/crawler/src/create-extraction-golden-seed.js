#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { bestEvidenceByField } from "./extraction-eval.js";

const DEFAULT_OUTPUT = "data/eval/extraction-golden-seed.json";
const DEFAULT_LIMIT = 120;
const DEFAULT_POOL_SIZE = 1000;
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
  node src/create-extraction-golden-seed.js [--limit=120] [--output=data/eval/extraction-golden-seed.json] [--strategy=stratified|newest] [--pool-size=1000]

Creates a reviewer seed file with poster context and current best
poster_field_evidence values. Fill truth fields after checking original sources,
then place reviewed JSON files under eval/golden/.`);
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

function compact(value, limit = 1000) {
  return Array.from(String(value ?? "").replace(/\s+/g, " ").trim()).slice(0, limit).join("");
}

async function fetchPosters(supabase, limit) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,source_org_name,source_key,thumbnail_url,summary_short,summary_long,application_end_at,created_at,exposure_tier,tier_reason")
    .in("poster_status", ["published", "review", "rejected"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function fetchEvidence(supabase, posterIds) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("poster_field_evidence")
        .select("poster_id,field_key,value_text,value_json,confidence,evidence_text,evidence_src,extractor")
        .in("poster_id", chunk)
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

function evidenceSummary(rows) {
  const best = bestEvidenceByField(rows);
  return Object.fromEntries([...best.entries()].map(([fieldKey, row]) => [
    fieldKey,
    {
      value_text: row.value_text,
      value_json: row.value_json,
      confidence: row.confidence,
      evidence_text: row.evidence_text,
      evidence_src: row.evidence_src,
      extractor: row.extractor,
    },
  ]));
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

function tierReasons(poster) {
  const reason = poster?.tier_reason?.reason;
  return Array.isArray(reason) ? reason.map(String) : [];
}

function chooseStratifiedPosters(posters, evidenceByPoster, limit) {
  const selected = [];
  const selectedIds = new Set();
  const targetCounts = [
    ["normal_recruit", Math.round(limit * 0.5)],
    ["text_or_missing_visual", Math.round(limit * 0.17)],
    ["visual_or_low_confidence", Math.round(limit * 0.13)],
    ["non_recruit_or_rejected", Math.round(limit * 0.13)],
    ["duplicate_suspected", Math.max(1, limit - Math.round(limit * 0.5) - Math.round(limit * 0.17) - Math.round(limit * 0.13) - Math.round(limit * 0.13))],
  ];
  const bucketCounts = Object.fromEntries(targetCounts.map(([bucket]) => [bucket, 0]));

  function bucketFor(poster) {
    const evidence = evidenceSummary(evidenceByPoster.get(poster.id) ?? []);
    const contentType = String(predictionFromEvidence(evidence.content_type) ?? "recruit");
    const isRealPoster = predictionFromEvidence(evidence.is_real_poster);
    const reasons = tierReasons(poster);
    if (reasons.includes("duplicate_suspected")) return "duplicate_suspected";
    if (poster.poster_status === "rejected" || ["admin", "news", "discard"].includes(contentType)) {
      return "non_recruit_or_rejected";
    }
    if (isRealPoster === false || reasons.some((reason) => reason.includes("is_real_poster"))) {
      return "visual_or_low_confidence";
    }
    if (!poster.thumbnail_url || isRealPoster === null) return "text_or_missing_visual";
    if (poster.poster_status === "published" && ["A", "B"].includes(String(poster.exposure_tier))) {
      return "normal_recruit";
    }
    if (poster.exposure_tier === "C") return "visual_or_low_confidence";
    return "normal_recruit";
  }

  function addPoster(poster, bucket) {
    if (!poster?.id || selectedIds.has(poster.id) || selected.length >= limit) return false;
    selected.push({ poster, bucket });
    selectedIds.add(poster.id);
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
    return true;
  }

  const postersByBucket = new Map();
  for (const poster of posters) {
    const bucket = bucketFor(poster);
    postersByBucket.set(bucket, [...(postersByBucket.get(bucket) ?? []), poster]);
  }

  for (const [bucket, target] of targetCounts) {
    for (const poster of postersByBucket.get(bucket) ?? []) {
      if (bucketCounts[bucket] >= target) break;
      addPoster(poster, bucket);
    }
  }

  for (const poster of posters) {
    if (selected.length >= limit) break;
    addPoster(poster, bucketFor(poster));
  }

  return {
    selected,
    bucketCounts,
    availableBucketCounts: Object.fromEntries(
      [...postersByBucket.entries()].map(([bucket, rows]) => [bucket, rows.length]),
    ),
  };
}

async function main() {
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const strategy = String(args.strategy || "stratified");
  const poolSize = strategy === "newest" ? limit : Math.max(limit, Number(args["pool-size"] || DEFAULT_POOL_SIZE));
  const supabase = createSupabase();
  const posterPool = await fetchPosters(supabase, poolSize);
  const evidenceRows = await fetchEvidence(supabase, posterPool.map((poster) => poster.id));
  const evidenceByPoster = new Map();

  for (const row of evidenceRows) {
    const list = evidenceByPoster.get(row.poster_id) ?? [];
    list.push(row);
    evidenceByPoster.set(row.poster_id, list);
  }

  const selection = strategy === "newest"
    ? {
        selected: posterPool.slice(0, limit).map((poster) => ({ poster, bucket: "newest" })),
        bucketCounts: { newest: Math.min(limit, posterPool.length) },
        availableBucketCounts: { newest: posterPool.length },
      }
    : chooseStratifiedPosters(posterPool, evidenceByPoster, limit);

  const items = selection.selected.map(({ poster, bucket }) => ({
    poster_id: poster.id,
    labeled_by: "",
    labeled_at: "",
    context: {
      title: poster.title,
      poster_status: poster.poster_status,
      source_org_name: poster.source_org_name,
      source_key: poster.source_key,
      thumbnail_url: poster.thumbnail_url,
      application_end_at: poster.application_end_at,
      exposure_tier: poster.exposure_tier,
      sample_bucket: bucket,
      source_excerpt: compact(`${poster.summary_short ?? ""}\n${poster.summary_long ?? ""}`, 1500),
    },
    current_evidence: evidenceSummary(evidenceByPoster.get(poster.id) ?? []),
    truth: {},
  }));

  const report = {
    generated_at: new Date().toISOString(),
    instructions: "Check the original source, fill truth only for reviewed fields, and move reviewed items under eval/golden/*.json.",
    strategy,
    pool_size: posterPool.length,
    sample_buckets: selection.bucketCounts,
    available_buckets: selection.availableBucketCounts,
    items,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    strategy,
    pool_size: posterPool.length,
    sampled: items.length,
    evidence_rows: evidenceRows.length,
    sample_buckets: selection.bucketCounts,
    available_buckets: selection.availableBucketCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
