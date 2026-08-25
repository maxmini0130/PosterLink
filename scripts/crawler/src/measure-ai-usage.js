#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_DAYS = 14;
const DEFAULT_LIMIT = 5000;
const DEFAULT_OUTPUT = "data/eval/reports/ai-usage-report.json";
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
  node src/measure-ai-usage.js [--days=14] [--limit=5000] [--output=data/eval/reports/ai-usage-report.json]

Reads ai_usage_log and ai_usage_daily_overview and writes a local Phase 6 usage
report. This command does not modify the database.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-ai-usage-measure" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function addMetrics(target, row) {
  target.call_count += toNumber(row.call_count ?? 1);
  target.input_tokens += toNumber(row.input_tokens);
  target.output_tokens += toNumber(row.output_tokens);
  target.image_count += toNumber(row.image_count);
  target.estimated_unit_cost = Number((target.estimated_unit_cost + toNumber(row.estimated_unit_cost)).toFixed(2));
}

function sortSummary(values) {
  return values.sort((a, b) => (
    b.estimated_unit_cost - a.estimated_unit_cost
    || b.call_count - a.call_count
    || String(a.key ?? a.stage_label ?? a.operation ?? "").localeCompare(String(b.key ?? b.stage_label ?? b.operation ?? ""))
  ));
}

function groupRows(rows, keyFn, labelKey = "key") {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!grouped.has(key)) {
      grouped.set(key, {
        [labelKey]: key,
        call_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        image_count: 0,
        estimated_unit_cost: 0,
      });
    }
    addMetrics(grouped.get(key), row);
  }
  return sortSummary([...grouped.values()]);
}

function countLinkedRows(rows) {
  const result = {
    total_rows_sampled: rows.length,
    poster_linked_rows: 0,
    candidate_metadata_rows: 0,
    unlinked_rows: 0,
  };

  for (const row of rows) {
    if (row.poster_id) {
      result.poster_linked_rows += 1;
    } else if (row.metadata?.candidateId || row.metadata?.sightingId) {
      result.candidate_metadata_rows += 1;
    } else {
      result.unlinked_rows += 1;
    }
  }
  return result;
}

export function summarizeAiUsage({ dailyRows = [], recentRows = [], days = DEFAULT_DAYS } = {}) {
  const totals = {
    days,
    daily_rows: dailyRows.length,
    recent_rows_sampled: recentRows.length,
    call_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    image_count: 0,
    estimated_unit_cost: 0,
  };
  for (const row of dailyRows) addMetrics(totals, row);

  return {
    generated_at: new Date().toISOString(),
    totals,
    by_stage: groupRows(dailyRows, (row) => row.stage_label, "stage_label"),
    by_operation: groupRows(dailyRows, (row) => row.operation, "operation"),
    by_model: groupRows(dailyRows, (row) => row.model, "model"),
    by_status: groupRows(dailyRows, (row) => row.status, "status"),
    linkage_sample: countLinkedRows(recentRows),
  };
}

async function fetchDailyRows(supabase, sinceDate) {
  const { data, error } = await supabase
    .from("ai_usage_daily_overview")
    .select("day_kst,stage,stage_label,model,operation,status,call_count,input_tokens,output_tokens,image_count,estimated_unit_cost")
    .gte("day_kst", sinceDate)
    .order("day_kst", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchRecentRows(supabase, sinceIso, limit) {
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("id,poster_id,operation,stage_label,model,status,metadata,created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const days = Math.max(1, Number(args.days ?? DEFAULT_DAYS));
  const limit = Math.max(1, Number(args.limit ?? DEFAULT_LIMIT));
  const output = args.output || DEFAULT_OUTPUT;
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  const sinceDate = since.toISOString().slice(0, 10);
  const sinceIso = since.toISOString();

  const supabase = createSupabase();
  const [dailyRows, recentRows] = await Promise.all([
    fetchDailyRows(supabase, sinceDate),
    fetchRecentRows(supabase, sinceIso, limit),
  ]);

  const report = summarizeAiUsage({ dailyRows, recentRows, days });
  const outputPath = path.resolve(REPO_ROOT, output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    output,
    days,
    call_count: report.totals.call_count,
    estimated_unit_cost: report.totals.estimated_unit_cost,
    linkage_sample: report.linkage_sample,
  }, null, 2));
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
