#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { evaluatePosterQuality, summarizeQualityIssues } from "./poster-quality-gate.js";

const DEFAULT_OUTPUT = "data/baseline/ai_kpi_report.json";
const DEFAULT_DAYS = 30;
const DEFAULT_QUERIES = [
  "청년 창업 지원금",
  "마포구 교육 프로그램",
  "소상공인 정책자금",
];
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
  node src/measure-ai-kpis.js [--days=30] [--output=data/baseline/ai_kpi_report.json] [--base-url=http://localhost:4000]

Measures automatically available AI/business-plan KPIs:
  - semantic embedding coverage
  - field verification guard coverage
  - recent crawler run latency and throughput
  - optional semantic-search API latency when --base-url is provided`);
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

function percent(numerator, denominator) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  return Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(2));
}

function percentile(values, ratio) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = Math.min(clean.length - 1, Math.ceil(clean.length * ratio) - 1);
  return clean[index];
}

async function countRows(supabase, table, applyFilters = (query) => query) {
  const query = applyFilters(supabase.from(table).select("id", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function measureEmbeddingCoverage(supabase) {
  const baseFilter = (query) => query.eq("poster_status", "published");
  const [published, embedded] = await Promise.all([
    countRows(supabase, "posters", baseFilter),
    countRows(supabase, "posters", (query) => baseFilter(query).not("embedding", "is", null)),
  ]);

  return {
    published_posters: published,
    embedded_posters: embedded,
    coverage_percent: percent(embedded, published),
    target_percent: 95,
  };
}

async function measureFieldVerificationCoverage(supabase) {
  const baseFilter = (query) => query.in("poster_status", ["published", "review"]);
  const [active, verified] = await Promise.all([
    countRows(supabase, "posters", baseFilter),
    countRows(supabase, "posters", (query) => baseFilter(query).not("field_verification", "is", null)),
  ]);

  return {
    active_posters: active,
    field_verified_posters: verified,
    coverage_percent: percent(verified, active),
    planning_target_percent: 98,
    note: "Coverage is not hallucination accuracy. Use the golden-set score for correctness.",
  };
}

async function measureReviewQueueQuality(supabase) {
  const { data, error, count } = await supabase
    .from("posters")
    .select("id,title,source_org_name,summary_short,summary_long,thumbnail_url,source_key,created_at", { count: "exact" })
    .eq("poster_status", "review")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const rows = data ?? [];
  const evaluations = rows.map((row) => {
    const quality = evaluatePosterQuality({
      ...row,
      images: row.thumbnail_url ? [row.thumbnail_url] : [],
    });
    return { row, quality };
  });
  const rejectCandidates = evaluations.filter(({ quality }) => quality.decision === "reject");
  const reviewWarnings = evaluations.filter(({ quality }) => quality.decision === "review");

  return {
    review_queue_count: count ?? rows.length,
    sampled_review_rows: rows.length,
    quality_gate_reject_candidates: rejectCandidates.length,
    quality_gate_review_warnings: reviewWarnings.length,
    estimated_nonposter_rate_percent: percent(rejectCandidates.length, rows.length),
    target_reject_candidates: 0,
    top_reject_candidates: rejectCandidates.slice(0, 20).map(({ row, quality }) => ({
      id: row.id,
      title: row.title,
      source_org_name: row.source_org_name,
      source_key: row.source_key,
      issues: quality.issues.map((issue) => issue.code),
      reason: summarizeQualityIssues(quality, 6),
    })),
  };
}

async function measureCollectionRuns(supabase, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("collection_source_runs")
    .select("source_slug,source_name,run_status,checked_count,new_count,valid_count,duration_ms,started_at,finished_at,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const runs = data ?? [];
  const durations = runs.map((run) => Number(run.duration_ms)).filter((value) => value > 0);
  const throughput = runs
    .map((run) => {
      const durationSeconds = Number(run.duration_ms) / 1000;
      return durationSeconds > 0 ? Number(run.checked_count ?? 0) / durationSeconds : null;
    })
    .filter((value) => Number.isFinite(value));
  const perCheckedItemMs = runs
    .map((run) => {
      const checkedCount = Number(run.checked_count ?? 0);
      const durationMs = Number(run.duration_ms);
      return checkedCount > 0 && durationMs > 0 ? durationMs / checkedCount : null;
    })
    .filter((value) => Number.isFinite(value));

  return {
    days,
    run_count: runs.length,
    success_like_count: runs.filter((run) => ["success", "partial", "empty"].includes(run.run_status)).length,
    error_count: runs.filter((run) => run.run_status === "error").length,
    success_like_rate_percent: percent(
      runs.filter((run) => ["success", "partial", "empty"].includes(run.run_status)).length,
      runs.length,
    ),
    avg_duration_ms: average(durations),
    p50_duration_ms: percentile(durations, 0.5),
    p95_duration_ms: percentile(durations, 0.95),
    avg_checked_per_second: average(throughput),
    avg_per_checked_item_ms: average(perCheckedItemMs),
    p50_per_checked_item_ms: percentile(perCheckedItemMs, 0.5),
    p95_per_checked_item_ms: percentile(perCheckedItemMs, 0.95),
    total_checked: runs.reduce((sum, run) => sum + Number(run.checked_count ?? 0), 0),
    total_new: runs.reduce((sum, run) => sum + Number(run.new_count ?? 0), 0),
    total_valid: runs.reduce((sum, run) => sum + Number(run.valid_count ?? 0), 0),
    target_single_item_ms: 3000,
    recent_runs: runs.slice(0, 20).map((run) => ({
      source_slug: run.source_slug,
      source_name: run.source_name,
      run_status: run.run_status,
      checked_count: run.checked_count,
      new_count: run.new_count,
      valid_count: run.valid_count,
      duration_ms: run.duration_ms,
      created_at: run.created_at,
    })),
  };
}

async function measureSemanticApi(baseUrl, queries) {
  if (!baseUrl) {
    return {
      skipped: true,
      reason: "Pass --base-url=http://localhost:4000 or POSTERLINK_BASE_URL to measure API latency.",
      target_latency_ms: 200,
    };
  }

  const endpoint = new URL("/api/posters/semantic-search", baseUrl).toString();
  const results = [];

  for (const query of queries) {
    const started = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 12 }),
    });
    const elapsedMs = Math.round(performance.now() - started);
    const payload = await response.json().catch(() => ({}));
    results.push({
      query,
      status: response.status,
      elapsed_ms: elapsedMs,
      semantic: Boolean(payload.semantic),
      result_count: Array.isArray(payload.posters) ? payload.posters.length : 0,
      reason: payload.reason ?? null,
    });
  }

  const latencies = results.map((result) => result.elapsed_ms);
  return {
    skipped: false,
    endpoint,
    target_latency_ms: 200,
    avg_latency_ms: average(latencies),
    p50_latency_ms: percentile(latencies, 0.5),
    p95_latency_ms: percentile(latencies, 0.95),
    semantic_success_rate_percent: percent(results.filter((result) => result.semantic).length, results.length),
    results,
  };
}

async function main() {
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const days = Math.max(1, Number(args.days || DEFAULT_DAYS));
  const baseUrl = args["base-url"] || process.env.POSTERLINK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  const queries = String(args.queries || "")
    .split("|")
    .map((query) => query.trim())
    .filter(Boolean);
  const supabase = createSupabase();

  const [embeddingCoverage, fieldVerificationCoverage, reviewQueueQuality, collectionRuns, semanticApi] = await Promise.all([
    measureEmbeddingCoverage(supabase),
    measureFieldVerificationCoverage(supabase),
    measureReviewQueueQuality(supabase),
    measureCollectionRuns(supabase, days),
    measureSemanticApi(baseUrl, queries.length > 0 ? queries : DEFAULT_QUERIES),
  ]);

  const report = {
    generated_at: new Date().toISOString(),
    days,
    kpis: {
      structured_accuracy: {
        target_percent: 95,
        measurement: "Use baseline:sample + human gold labels + baseline:score.",
      },
      embedding_coverage: embeddingCoverage,
      field_verification_coverage: fieldVerificationCoverage,
      review_queue_quality: reviewQueueQuality,
      collection_processing: collectionRuns,
      semantic_search_latency: semanticApi,
    },
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    output,
    generated_at: report.generated_at,
    embedding_coverage_percent: embeddingCoverage.coverage_percent,
    field_verification_coverage_percent: fieldVerificationCoverage.coverage_percent,
    review_queue_count: reviewQueueQuality.review_queue_count,
    review_queue_reject_candidates: reviewQueueQuality.quality_gate_reject_candidates,
    collection_run_count: collectionRuns.run_count,
    collection_p95_duration_ms: collectionRuns.p95_duration_ms,
    semantic_api_p95_latency_ms: semanticApi.skipped ? "skipped" : semanticApi.p95_latency_ms,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
