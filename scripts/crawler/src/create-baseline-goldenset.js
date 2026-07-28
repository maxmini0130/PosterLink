#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT = "data/baseline/goldenset_sample.csv";
const DEFAULT_LIMIT = 100;
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
  node src/create-baseline-goldenset.js [--output=data/baseline/goldenset_sample.csv] [--limit=100]

Creates a reviewer-facing CSV. Fill the gold_* columns, then run:
  node src/score-baseline-goldenset.js --input=data/baseline/goldenset_sample.csv

Gold labels:
  1 = correct / yes
  0 = incorrect / no
  blank = exclude from that metric`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(values) {
  return values.map(csvValue).join(",");
}

function compact(value, maxLength = 800) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getClassification(row) {
  const verification = asObject(row.field_verification);
  return asObject(verification.classification);
}

function getDuplicateDecision(row) {
  const verification = asObject(row.field_verification);
  const issues = [
    ...(Array.isArray(verification.duplicateIssues) ? verification.duplicateIssues : []),
    ...(Array.isArray(row.quality_issues) ? row.quality_issues : []),
  ];
  if (issues.some((issue) => String(issue?.code ?? "").includes("duplicate"))) return "review";
  return "";
}

function getPredictedCategory(row, categoryMap) {
  if (row.kind === "candidate") {
    const classification = getClassification(row);
    const categoryCodes = Array.isArray(classification.categoryCodes) ? classification.categoryCodes : [];
    return compact(row.category_name || categoryCodes.join("; "));
  }
  const categories = (categoryMap.get(row.id) ?? []).map((category) => category.name).filter(Boolean);
  return compact(categories.join("; "));
}

async function fetchPosterCategoryMap(supabase, posterIds) {
  const map = new Map();
  if (posterIds.length === 0) return map;

  for (let index = 0; index < posterIds.length; index += 100) {
    const batch = posterIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from("poster_categories")
      .select("poster_id,categories(name,code)")
      .in("poster_id", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      const list = map.get(row.poster_id) ?? [];
      list.push(row.categories ?? {});
      map.set(row.poster_id, list);
    }
  }
  return map;
}

async function fetchPosters(supabase, limit) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,source_org_name,poster_status,application_end_at,summary_short,summary_long,source_key,thumbnail_url,field_verification,created_at")
    .in("poster_status", ["published", "review", "rejected"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, kind: "poster" }));
}

async function fetchCandidates(supabase, limit) {
  const { data, error } = await supabase
    .from("poster_notice_candidates")
    .select("id,title,source_org_name,candidate_status,candidate_type,application_end_at,summary_short,summary_long,source_key,source_url,category_name,field_verification,quality_issues,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error?.code === "42P01" || String(error?.message ?? "").includes("poster_notice_candidates")) return [];
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    kind: "candidate",
    poster_status: row.candidate_status,
    source_key: row.source_url || row.source_key,
  }));
}

function toBaselineRow(row, categoryMap) {
  const classification = getClassification(row);
  const route = compact(classification.route || classification.decision || "");
  const predictedIsValidPoster = row.kind === "poster"
    ? (row.poster_status === "rejected" ? "0" : "1")
    : (row.candidate_status === "rejected" ? "0" : "1");
  const predictedDeadline = row.application_end_at ? String(row.application_end_at).slice(0, 10) : "";
  const predictedCategory = getPredictedCategory(row, categoryMap);
  const predictedDuplicate = getDuplicateDecision(row);

  return {
    sample_id: `${row.kind}:${row.id}`,
    kind: row.kind,
    status: row.poster_status ?? "",
    source_key: row.source_key ?? "",
    thumbnail_url: row.thumbnail_url ?? "",
    predicted_is_valid_poster: predictedIsValidPoster,
    predicted_route: route,
    predicted_title: compact(row.title, 240),
    predicted_org: compact(row.source_org_name, 160),
    predicted_deadline: predictedDeadline,
    predicted_category: predictedCategory,
    predicted_duplicate_decision: predictedDuplicate,
    source_excerpt: compact(`${row.title ?? ""}\n${row.summary_short ?? ""}\n${row.summary_long ?? ""}`, 1200),
    gold_is_valid_poster: "",
    gold_title_ok: "",
    gold_org_ok: "",
    gold_deadline_ok: "",
    gold_category_ok: "",
    gold_duplicate_ok: "",
    gold_notes: "",
  };
}

async function main() {
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const supabase = createSupabase();
  const posterLimit = Math.ceil(limit * 0.7);
  const candidateLimit = Math.max(0, limit - posterLimit);

  const [posters, candidates] = await Promise.all([
    fetchPosters(supabase, posterLimit),
    fetchCandidates(supabase, candidateLimit),
  ]);
  const categoryMap = await fetchPosterCategoryMap(supabase, posters.map((row) => row.id));
  const rows = [...posters, ...candidates]
    .slice(0, limit)
    .map((row) => toBaselineRow(row, categoryMap));

  const header = [
    "sample_id",
    "kind",
    "status",
    "source_key",
    "thumbnail_url",
    "predicted_is_valid_poster",
    "predicted_route",
    "predicted_title",
    "predicted_org",
    "predicted_deadline",
    "predicted_category",
    "predicted_duplicate_decision",
    "source_excerpt",
    "gold_is_valid_poster",
    "gold_title_ok",
    "gold_org_ok",
    "gold_deadline_ok",
    "gold_category_ok",
    "gold_duplicate_ok",
    "gold_notes",
  ];

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, [csvLine(header), ...rows.map((row) => csvLine(header.map((key) => row[key])))]
    .join("\n"), "utf-8");

  console.log(JSON.stringify({
    output,
    sampled: rows.length,
    posters: posters.length,
    candidates: candidates.length,
    next: `Fill gold_* columns, then run: pnpm --filter posterlink-crawler baseline:score -- --input=${output}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
