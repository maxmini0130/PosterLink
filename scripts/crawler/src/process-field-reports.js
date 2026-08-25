#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  buildFieldReportEscalationPlans,
  FIELD_REPORT_THRESHOLD,
} from "./field-report-escalation.js";

const DEFAULT_OUTPUT = "data/results/field-report-escalation-dryrun.json";
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
  node src/process-field-reports.js [--limit=5000] [--threshold=2] [--output=data/results/field-report-escalation-dryrun.json] [--apply]

Escalates repeated field_reports into review work. Dry-run is the default.
--apply sets matching non-human poster_field_evidence confidence to 0, moves
published posters back to review, marks reports as reviewing, and writes an
admin_actions audit row.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-field-report-escalation" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchReports(supabase, limit) {
  const { data, error } = await supabase
    .from("field_reports")
    .select("id,poster_id,field_key,note,report_status,created_at")
    .in("report_status", ["received", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function fetchPosters(supabase, posterIds) {
  if (posterIds.length === 0) return [];
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function applyPlan(supabase, plan) {
  const result = {
    poster_id: plan.poster_id,
    field_key: plan.field_key,
    report_count: plan.report_count,
    evidence_status: "pending",
    poster_status: "skipped",
    report_status: "pending",
    admin_action_status: "pending",
    errors: [],
  };

  const evidenceUpdate = await supabase
    .from("poster_field_evidence")
    .update({ confidence: 0 })
    .eq("poster_id", plan.poster_id)
    .eq("field_key", plan.field_key)
    .neq("extractor", "human");
  if (evidenceUpdate.error) {
    result.evidence_status = "failed";
    result.errors.push(evidenceUpdate.error.message);
  } else {
    result.evidence_status = "applied";
  }

  if (plan.should_move_to_review) {
    const posterUpdate = await supabase
      .from("posters")
      .update({ poster_status: "review" })
      .eq("id", plan.poster_id)
      .eq("poster_status", "published");
    if (posterUpdate.error) {
      result.poster_status = "failed";
      result.errors.push(posterUpdate.error.message);
    } else {
      result.poster_status = "review";
    }
  }

  const reportUpdate = await supabase
    .from("field_reports")
    .update({ report_status: "reviewing" })
    .in("id", plan.report_ids);
  if (reportUpdate.error) {
    result.report_status = "failed";
    result.errors.push(reportUpdate.error.message);
  } else {
    result.report_status = "reviewing";
  }

  const actionInsert = await supabase.from("admin_actions").insert({
    actor_user_id: null,
    target_type: "report",
    target_id: plan.report_ids[0] ?? null,
    action_type: "update",
    action_reason: "field_report_threshold_escalation",
    metadata_json: {
      posterId: plan.poster_id,
      fieldKey: plan.field_key,
      reportIds: plan.report_ids,
      reportCount: plan.report_count,
      movedToReview: plan.should_move_to_review,
      zeroedEvidenceConfidence: true,
    },
  });
  if (actionInsert.error) {
    result.admin_action_status = "failed";
    result.errors.push(actionInsert.error.message);
  } else {
    result.admin_action_status = "inserted";
  }

  return {
    ...result,
    status: result.errors.length > 0 ? "failed" : "applied",
  };
}

async function main() {
  const supabase = createSupabase();
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const threshold = Math.max(1, Number(args.threshold || FIELD_REPORT_THRESHOLD));
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);

  const reports = await fetchReports(supabase, limit);
  const posterIds = Array.from(new Set(reports.map((report) => report.poster_id).filter(Boolean)));
  const posters = await fetchPosters(supabase, posterIds);
  const plans = buildFieldReportEscalationPlans({ reports, posters, threshold });
  const results = [];
  if (apply) {
    for (const plan of plans) {
      results.push(await applyPlan(supabase, plan));
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    threshold,
    checked_report_count: reports.length,
    checked_poster_count: posters.length,
    escalation_count: plans.length,
    move_to_review_count: plans.filter((plan) => plan.should_move_to_review).length,
    applied_count: results.filter((result) => result.status === "applied").length,
    failed_count: results.filter((result) => result.status === "failed").length,
    plans,
    results,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    mode: report.mode,
    threshold: report.threshold,
    checked_report_count: report.checked_report_count,
    checked_poster_count: report.checked_poster_count,
    escalation_count: report.escalation_count,
    move_to_review_count: report.move_to_review_count,
    applied_count: report.applied_count,
    failed_count: report.failed_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
