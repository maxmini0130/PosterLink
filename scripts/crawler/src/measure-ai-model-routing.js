#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  buildAiUsageLogRow,
  chooseAiStage,
  estimateAiUnitCost,
} from "./ai-model-routing.js";
import { FIELD_IMPORTANCE } from "./extraction-eval.js";
import {
  bestFieldsFromEvidence,
  DEFAULT_EXTRACTION_THRESHOLDS,
  fieldValue,
} from "./exposure-tier.js";

const DEFAULT_OUTPUT = "data/eval/reports/ai-model-routing-dryrun.json";
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
  node src/measure-ai-model-routing.js [--limit=5000] [--statuses=published,review] [--output=data/eval/reports/ai-model-routing-dryrun.json]

Dry-run Phase 6 model-tier routing against current poster_field_evidence. This
script only reads the database and writes a local report.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-ai-model-routing-measure" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchPosters(supabase, statuses, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,thumbnail_url,created_at")
      .in("poster_status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function fetchEvidence(supabase, posterIds) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("poster_field_evidence")
        .select("poster_id,field_key,value_text,value_json,confidence,evidence_src,extractor")
        .in("poster_id", chunk)
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

function hasRuleCandidate(fieldKey, field) {
  if (!field) return false;
  if (field.evidence_src === "rule") return true;
  return /(?:regex|deadline|url|contact|cost|routing|poster-detection)/i.test(String(field.extractor ?? ""));
}

function needsVlmForPosterField(field) {
  if (!field) return true;
  const value = fieldValue(field);
  const confidence = Number(field.confidence);
  return value === null || value === undefined || !Number.isFinite(confidence) || confidence < DEFAULT_EXTRACTION_THRESHOLDS.is_real_poster;
}

function summarizePlans(plans) {
  const stages = {};
  const fields = {};
  let estimatedUnitCost = 0;
  for (const plan of plans) {
    stages[plan.stage_label] = (stages[plan.stage_label] ?? 0) + 1;
    fields[plan.field_key] = (fields[plan.field_key] ?? 0) + 1;
    estimatedUnitCost += plan.estimated_unit_cost;
  }
  return {
    stages,
    fields,
    estimatedUnitCost: Math.round(estimatedUnitCost * 100) / 100,
  };
}

async function main() {
  const supabase = createSupabase();
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const statuses = String(args.statuses || "published,review")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);

  const posters = await fetchPosters(supabase, statuses, limit);
  const evidenceRows = await fetchEvidence(supabase, posters.map((poster) => poster.id));
  const evidenceByPoster = new Map();
  for (const row of evidenceRows) {
    const list = evidenceByPoster.get(row.poster_id) ?? [];
    list.push(row);
    evidenceByPoster.set(row.poster_id, list);
  }

  const plans = [];
  for (const poster of posters) {
    const fields = bestFieldsFromEvidence(evidenceByPoster.get(poster.id) ?? []);
    for (const [fieldKey, importance] of Object.entries(FIELD_IMPORTANCE)) {
      const field = fields[fieldKey];
      const threshold = DEFAULT_EXTRACTION_THRESHOLDS[fieldKey] ?? (importance === "critical" ? 0.9 : 0.8);
      const confidence = field ? Number(field.confidence) : null;
      const value = fieldValue(field);
      const passes = field && value !== null && value !== undefined && Number.isFinite(confidence) && confidence >= threshold;
      if (passes) continue;

      const stage = chooseAiStage({
        fieldKey,
        confidence,
        threshold,
        hasRuleCandidate: hasRuleCandidate(fieldKey, field),
        needsVlm: fieldKey === "is_real_poster" ? needsVlmForPosterField(field) : false,
        critical: importance === "critical",
      });
      const inputTokens = fieldKey === "is_real_poster" ? 250 : 900;
      const outputTokens = fieldKey === "is_real_poster" ? 80 : 180;
      const imageCount = fieldKey === "is_real_poster" && poster.thumbnail_url ? 1 : 0;
      const estimatedUnitCost = estimateAiUnitCost({
        stageLabel: stage.label,
        inputTokens,
        outputTokens,
        imageCount,
      });
      plans.push({
        poster_id: poster.id,
        title: poster.title,
        poster_status: poster.poster_status,
        field_key: fieldKey,
        importance,
        current_confidence: confidence,
        threshold,
        current_extractor: field?.extractor ?? null,
        stage: stage.stage,
        stage_label: stage.label,
        model: stage.model,
        reason: stage.reason,
        estimated_unit_cost: estimatedUnitCost,
      });
    }
  }

  const usageLogSamples = plans.slice(0, 20).map((plan) => buildAiUsageLogRow({
    jobName: "phase6-routing-dryrun",
    stageLabel: plan.stage_label,
    model: plan.model,
    operation: plan.field_key,
    posterId: plan.poster_id,
    fieldKey: plan.field_key,
    status: "planned",
    inputTokens: plan.field_key === "is_real_poster" ? 250 : 900,
    outputTokens: plan.field_key === "is_real_poster" ? 80 : 180,
    imageCount: plan.field_key === "is_real_poster" ? 1 : 0,
    unitCost: plan.estimated_unit_cost,
    metadata: { reason: plan.reason },
  }));
  const summary = summarizePlans(plans);
  const plannedModelCallCount = plans.filter((plan) => plan.stage_label !== "rule").length;
  const report = {
    generated_at: new Date().toISOString(),
    mode: "dry-run",
    statuses,
    checked_count: posters.length,
    evidence_row_count: evidenceRows.length,
    planned_action_count: plans.length,
    planned_model_call_count: plannedModelCallCount,
    ...summary,
    plans,
    usage_log_samples: usageLogSamples,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    mode: report.mode,
    checked_count: report.checked_count,
    evidence_row_count: report.evidence_row_count,
    planned_action_count: report.planned_action_count,
    planned_model_call_count: report.planned_model_call_count,
    stages: report.stages,
    top_fields: Object.fromEntries(
      Object.entries(report.fields)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    ),
    estimated_unit_cost: report.estimatedUnitCost,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
