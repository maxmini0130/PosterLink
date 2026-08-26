#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { bestEvidenceByField } from "./extraction-eval.js";
import { normalizeEvidenceRow } from "./field-evidence.js";

const DEFAULT_INPUT = "data/eval/reports/extraction-phase2-deadline-range-eval-20260826.json";
const DEFAULT_OUTPUT = "data/results/golden-evidence-corrections-dryrun-20260826.json";
const DEFAULT_FIELDS = ["deadline_date", "deadline_type"];
const CORRECTION_EXTRACTOR = "golden-correction-v1";
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
  node src/plan-golden-evidence-corrections.js [--input=data/eval/reports/extraction-current.json] [--fields=deadline_date,deadline_type] [--output=data/results/golden-evidence-corrections-dryrun.json] [--apply]

Builds a correction plan from human-labeled Phase 2 golden-set mismatches.
Dry-run is the default. --apply lowers conflicting evidence confidence to 0
and upserts only non-null/non-unknown correction evidence.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-golden-evidence-corrections" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fieldValueJson(fieldKey, truth) {
  if (fieldKey === "deadline_date") return { date: truth };
  if (fieldKey === "deadline_type") return { type: truth };
  return { value: truth };
}

function shouldUpsertCorrection(fieldKey, truth) {
  if (truth === null || truth === undefined || truth === "") return false;
  if (fieldKey === "deadline_type" && truth === "unknown") return false;
  return true;
}

function buildCorrectionRow(observation) {
  if (!shouldUpsertCorrection(observation.field_key, observation.truth)) return null;
  return normalizeEvidenceRow({
    posterId: observation.poster_id,
    fieldKey: observation.field_key,
    valueText: String(observation.truth),
    valueJson: fieldValueJson(observation.field_key, observation.truth),
    confidence: 1,
    evidenceText: `Phase 2 golden-set correction for ${observation.field_key}`,
    evidenceSrc: "operator",
    extractor: CORRECTION_EXTRACTOR,
  });
}

async function fetchEvidenceRows(supabase, posterIds, fields) {
  if (posterIds.length === 0) return [];
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("poster_field_evidence")
      .select("id,poster_id,field_key,value_text,value_json,confidence,evidence_text,evidence_src,extractor,extracted_at")
      .in("poster_id", chunk)
      .in("field_key", fields);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function buildPlans({ report, evidenceRows, fields }) {
  const targetFields = new Set(fields);
  const mismatches = (report.observations ?? []).filter(
    (observation) => targetFields.has(observation.field_key) && observation.correct === false,
  );

  const evidenceByPosterField = new Map();
  for (const row of evidenceRows) {
    const key = `${row.poster_id}:${row.field_key}`;
    const list = evidenceByPosterField.get(key) ?? [];
    list.push(row);
    evidenceByPosterField.set(key, list);
  }

  const plans = mismatches.map((observation) => {
    const evidenceRowsForField = evidenceByPosterField.get(`${observation.poster_id}:${observation.field_key}`) ?? [];
    const best = bestEvidenceByField(evidenceRowsForField).get(observation.field_key) ?? null;
    const correction = buildCorrectionRow(observation);
    const suppressions = evidenceRowsForField
      .filter((row) => row.extractor !== CORRECTION_EXTRACTOR)
      .filter((row) => Number(row.confidence ?? 0) > 0)
      .map((row) => ({
        id: row.id,
        poster_id: row.poster_id,
        field_key: row.field_key,
        extractor: row.extractor,
        current_confidence: Number(row.confidence ?? 0),
        value_text: row.value_text,
        value_json: row.value_json,
      }));

    return {
      poster_id: observation.poster_id,
      field_key: observation.field_key,
      truth: observation.truth,
      predicted: observation.predicted,
      predicted_confidence: observation.confidence,
      predicted_extractor: observation.extractor,
      best_evidence_id: best?.id ?? null,
      upsert_correction: correction,
      suppressions,
      suppression_count: suppressions.length,
      note: correction
        ? "suppress conflicting evidence and upsert golden correction"
        : "suppress conflicting evidence only; truth is null/unknown",
    };
  });

  return plans;
}

async function applyPlans(supabase, plans) {
  const results = [];
  for (const plan of plans) {
    const result = {
      poster_id: plan.poster_id,
      field_key: plan.field_key,
      suppressed_count: 0,
      upserted: false,
      errors: [],
    };

    const suppressionIds = plan.suppressions.map((row) => row.id).filter(Boolean);
    if (suppressionIds.length > 0) {
      const { error } = await supabase
        .from("poster_field_evidence")
        .update({ confidence: 0 })
        .in("id", suppressionIds);
      if (error) result.errors.push(error.message);
      else result.suppressed_count = suppressionIds.length;
    }

    if (plan.upsert_correction) {
      const { error } = await supabase
        .from("poster_field_evidence")
        .upsert(plan.upsert_correction, { onConflict: "poster_id,field_key,extractor" });
      if (error) result.errors.push(error.message);
      else result.upserted = true;
    }

    results.push({
      ...result,
      status: result.errors.length > 0 ? "failed" : "applied",
    });
  }
  return results;
}

async function main() {
  const input = path.resolve(REPO_ROOT, args.input || DEFAULT_INPUT);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const fields = String(args.fields || DEFAULT_FIELDS.join(","))
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  const apply = Boolean(args.apply);

  const report = JSON.parse(await fs.readFile(input, "utf8"));
  const posterIds = [
    ...new Set(
      (report.observations ?? [])
        .filter((observation) => fields.includes(observation.field_key) && observation.correct === false)
        .map((observation) => observation.poster_id),
    ),
  ];
  const supabase = createSupabase();
  const evidenceRows = await fetchEvidenceRows(supabase, posterIds, fields);
  const plans = buildPlans({ report, evidenceRows, fields });
  const results = apply ? await applyPlans(supabase, plans) : [];

  const summary = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    input: path.relative(REPO_ROOT, input).replace(/\\/g, "/"),
    fields,
    mismatch_count: plans.length,
    correction_upsert_count: plans.filter((plan) => plan.upsert_correction).length,
    suppression_count: plans.reduce((sum, plan) => sum + plan.suppression_count, 0),
    suppression_only_count: plans.filter((plan) => !plan.upsert_correction).length,
    applied_count: results.filter((result) => result.status === "applied").length,
    failed_count: results.filter((result) => result.status === "failed").length,
    plans,
    results,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, output).replace(/\\/g, "/"),
    mode: summary.mode,
    fields,
    mismatch_count: summary.mismatch_count,
    correction_upsert_count: summary.correction_upsert_count,
    suppression_count: summary.suppression_count,
    suppression_only_count: summary.suppression_only_count,
    applied_count: summary.applied_count,
    failed_count: summary.failed_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
