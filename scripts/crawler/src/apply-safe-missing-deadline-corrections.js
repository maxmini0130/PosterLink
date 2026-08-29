#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_INPUT = path.join(REPO_ROOT, "data", "eval", "reports", "date-period-mapping-audit.json");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "safe-missing-deadline-corrections.json");
const EXTRACTOR = "safe-missing-deadline-corrections-v1";
const TODAY_KST = "2026-08-29";

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-safe-missing-deadline-corrections" } },
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isSafeMissingDeadline(row, { includePast = false } = {}) {
  return (
    !row.application_end_at &&
    row.audit_suggested_deadline &&
    (includePast || row.audit_suggested_deadline >= TODAY_KST) &&
    row.missing_clear_deadline === true &&
    !asArray(row.audit_issue_codes).includes("always-open-conflict")
  );
}

function mergeFieldVerification(row, deadline) {
  const verification = row.field_verification && typeof row.field_verification === "object"
    ? row.field_verification
    : {};
  return {
    ...verification,
    deadlineMatches: true,
    correctedDeadline: null,
    dateIssues: [],
    dateQuality: {
      ...(verification.dateQuality && typeof verification.dateQuality === "object" ? verification.dateQuality : {}),
      decision: "pass",
      storedDeadline: deadline,
      extractedDeadline: deadline,
      normalizedDeadline: deadline,
      suggestedDeadline: deadline,
      issues: [],
      updatedBy: EXTRACTOR,
      updatedAt: new Date().toISOString(),
    },
  };
}

async function fetchPosters(supabase, ids) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,application_end_at,field_verification")
    .in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function applyPlan(supabase, plan) {
  let updated = 0;
  const evidenceRows = [];
  for (const item of plan) {
    const { error } = await supabase
      .from("posters")
      .update({
        application_end_at: item.deadline,
        field_verification: item.field_verification,
      })
      .eq("id", item.id)
      .is("application_end_at", null);
    if (error) throw error;
    updated += 1;

    evidenceRows.push({
      poster_id: item.id,
      field_key: "deadline_date",
      value_text: item.deadline,
      value_json: { date: item.deadline },
      confidence: 0.9,
      evidence_text: item.evidence,
      evidence_src: "body",
      extractor: EXTRACTOR,
    });
  }

  if (evidenceRows.length > 0) {
    const { error } = await supabase
      .from("poster_field_evidence")
      .upsert(evidenceRows, { onConflict: "poster_id,field_key,extractor" });
    if (error) throw error;
  }

  return { updated, evidence_rows: evidenceRows.length };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const includePast = args["include-past"] === "1" || args["include-past"] === "true";
  const inputPath = args.input ? path.resolve(args.input) : DEFAULT_INPUT;
  const audit = JSON.parse(await fs.readFile(inputPath, "utf-8"));
  const candidates = asArray(audit.missing_clear_deadlines).filter((row) =>
    isSafeMissingDeadline(row, { includePast })
  );

  const supabase = createSupabase();
  const posterById = await fetchPosters(supabase, candidates.map((row) => row.id));
  const plan = candidates.map((candidate) => {
    const poster = posterById.get(candidate.id);
    if (!poster) throw new Error(`Missing poster ${candidate.id}`);
    return {
      id: candidate.id,
      title: candidate.title,
      status: candidate.status,
      deadline: candidate.audit_suggested_deadline,
      evidence: asArray(candidate.audit_issues).map((issue) => issue.evidence).filter(Boolean)[0] ?? candidate.summary_hint ?? candidate.title,
      field_verification: mergeFieldVerification(poster, candidate.audit_suggested_deadline),
    };
  });
  const result = apply ? await applyPlan(supabase, plan) : { updated: 0, evidence_rows: 0 };

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    include_past: includePast,
    input: inputPath,
    candidate_count: plan.length,
    result,
    plan: plan.map(({ field_verification, ...item }) => item),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`mode=${report.mode}`);
  console.log(`candidate_count=${report.candidate_count}`);
  console.log(`updated=${report.result.updated}`);
  console.log(`evidence_rows=${report.result.evidence_rows}`);
  console.log(`report=${REPORT_PATH}`);
  for (const item of report.plan) {
    console.log(`- [${item.status}] ${item.title} => ${item.deadline}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
