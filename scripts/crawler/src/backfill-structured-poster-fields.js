#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { buildStructuredPosterFields } from "./poster-structured-fields.js";
import { shouldBackfillStructuredField } from "./structured-backfill-policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_OUTPUT = "data/results/structured-poster-backfill.json";
const DEFAULT_MIN_CONFIDENCE = 0.8;
const STRUCTURED_SELECT =
  "id,title,source_org_name,source_key,summary_short,summary_long,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,field_verification,organizer_name,application_organization_name,deadline_type,eligibility_summary,target_age_min,target_age_max,benefits_summary,recruitment_count,application_method,contact_info,event_location,verification_status,data_confidence,created_at";
const LEGACY_SELECT =
  "id,title,source_org_name,source_key,summary_short,summary_long,poster_status,application_start_at,application_end_at,field_verification,created_at";
const STRUCTURED_FIELDS = [
  "organizer_name",
  "application_organization_name",
  "deadline_type",
  "event_start_at",
  "event_end_at",
  "eligibility_summary",
  "target_age_min",
  "target_age_max",
  "benefits_summary",
  "recruitment_count",
  "application_method",
  "contact_info",
  "event_location",
  "verification_status",
  "data_confidence",
];

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/backfill-structured-poster-fields.js [--limit=2000] [--statuses=published,review] [--min-confidence=0.8] [--include-user-facing-text] [--output=data/results/structured-poster-backfill.json] [--apply]

Builds structured poster fields only from existing dates and field_verification evidence.
Organization fields require the minimum confidence and no review issues.
Target, benefits, method, contact, and location stay excluded unless --include-user-facing-text is explicitly supplied.
Dry-run is the default. --apply requires migration 20260804000000 to be present in the DB.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_KEY are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMissingStructuredColumn(error) {
  const message = String(error?.message ?? "");
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /organizer_name|deadline_type|verification_status/.test(message)
  );
}

function hasReviewIssues(verification) {
  if (!verification || typeof verification !== "object") return false;
  return (
    verification.decision === "needs_review" ||
    [
      "dateIssues",
      "classificationIssues",
      "qualityIssues",
      "duplicateIssues",
    ].some(
      (key) => Array.isArray(verification[key]) && verification[key].length > 0,
    )
  );
}

function compactSourceText(row) {
  return [row.title, row.summary_short, row.summary_long]
    .filter(Boolean)
    .join("\n")
    .slice(0, 10_000);
}

async function fetchRows(supabase, statuses, limit) {
  const rows = [];
  let schemaReady = true;
  const pageSize = Math.min(1000, limit);

  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const to = offset + Math.min(pageSize, limit - rows.length) - 1;
    let result = await supabase
      .from("posters")
      .select(STRUCTURED_SELECT)
      .in("poster_status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (isMissingStructuredColumn(result.error)) {
      schemaReady = false;
      result = await supabase
        .from("posters")
        .select(LEGACY_SELECT)
        .in("poster_status", statuses)
        .order("created_at", { ascending: false })
        .range(offset, to);
    }
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < pageSize) break;
  }

  return { rows: rows.slice(0, limit), schemaReady };
}

function buildPlan(row, schemaReady, { minConfidence, includeUserFacingText }) {
  const reviewIssues = hasReviewIssues(row.field_verification);
  const verificationStatus = reviewIssues ? "needs_review" : "unverified";
  const derived = buildStructuredPosterFields({
    fieldVerification: row.field_verification,
    applicationStartAt: row.application_start_at,
    applicationEndAt: row.application_end_at,
    eventStartAt: row.event_start_at,
    eventEndAt: row.event_end_at,
    sourceText: compactSourceText(row),
    verificationStatus,
  });
  const updates = {};
  const confidence = derived.data_confidence;
  const canBackfillVerifiedText =
    !reviewIssues && confidence != null && confidence >= minConfidence;

  for (const field of STRUCTURED_FIELDS) {
    const nextValue = derived[field];
    if (
      !shouldBackfillStructuredField({
        field,
        reviewIssues,
        confidence,
        minConfidence,
        includeUserFacingText,
      })
    )
      continue;
    if (
      nextValue == null ||
      nextValue === "unknown" ||
      nextValue === "unverified"
    )
      continue;
    if (
      !schemaReady ||
      row[field] == null ||
      row[field] === "unknown" ||
      row[field] === "unverified"
    ) {
      updates[field] = nextValue;
    }
  }

  return {
    id: row.id,
    title: row.title,
    source_key: row.source_key,
    poster_status: row.poster_status,
    before: schemaReady
      ? Object.fromEntries(
          STRUCTURED_FIELDS.map((field) => [field, row[field] ?? null]),
        )
      : null,
    updates,
    evidence: {
      has_application_end_at: Boolean(row.application_end_at),
      has_organization: Boolean(row.field_verification?.organization),
      has_readable_notice: Boolean(
        row.field_verification?.readableNotice?.facts,
      ),
      readable_facts: row.field_verification?.readableNotice?.facts ?? null,
      llm_filled_fields:
        row.field_verification?.readableNotice?.factsLlmMeta?.filledByLlm ?? [],
      has_review_issues: reviewIssues,
      verified_text_eligible: canBackfillVerifiedText,
    },
  };
}

async function main() {
  const supabase = createSupabase();
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || 2000));
  const minConfidence = Math.max(
    0,
    Math.min(1, Number(args["min-confidence"] || DEFAULT_MIN_CONFIDENCE)),
  );
  const includeUserFacingText = Boolean(args["include-user-facing-text"]);
  const statuses = String(args.statuses || "published,review")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const { rows, schemaReady } = await fetchRows(supabase, statuses, limit);
  if (apply && !schemaReady) {
    throw new Error(
      "Migration 20260804000000 is not applied. Refusing --apply.",
    );
  }

  const plans = rows.map((row) =>
    buildPlan(row, schemaReady, { minConfidence, includeUserFacingText }),
  );
  const candidates = plans.filter(
    (plan) => Object.keys(plan.updates).length > 0,
  );
  const results = [];

  if (apply) {
    for (const plan of candidates) {
      const { error } = await supabase
        .from("posters")
        .update(plan.updates)
        .eq("id", plan.id);
      results.push({
        id: plan.id,
        status: error ? "failed" : "applied",
        error: error?.message ?? null,
      });
      if (error)
        console.error(
          `[structured:backfill] ${plan.id} failed: ${error.message}`,
        );
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    migration_ready: schemaReady,
    min_confidence: minConfidence,
    include_user_facing_text: includeUserFacingText,
    statuses,
    checked_count: rows.length,
    candidate_count: candidates.length,
    applied_count: results.filter((result) => result.status === "applied")
      .length,
    failed_count: results.filter((result) => result.status === "failed").length,
    field_counts: Object.fromEntries(
      STRUCTURED_FIELDS.map((field) => [
        field,
        candidates.filter((plan) =>
          Object.prototype.hasOwnProperty.call(plan.updates, field),
        ).length,
      ]),
    ),
    plans: candidates,
    results,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        output,
        mode: report.mode,
        migration_ready: report.migration_ready,
        checked_count: report.checked_count,
        candidate_count: report.candidate_count,
        field_counts: report.field_counts,
        applied_count: report.applied_count,
        failed_count: report.failed_count,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
