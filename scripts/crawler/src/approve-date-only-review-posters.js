#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  chooseDeadlineForStorage,
  evaluatePosterDateQuality,
  normalizeDateOnly,
} from "./poster-date-quality.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_OUTPUT = "data/results/date-only-review-approval-plan-20260906.json";
const CONFIRM_TOKEN = "APPROVE_DATE_ONLY_REVIEW_POSTERS";
const TODAY_KST = "2026-09-06";

const OPEN_ENDED_PATTERN = /\uC120\uCC29|\uC811\uC218|\uBAA8\uC9D1|\uC751\uBAA8|\uC9C0\uC6D0|\uB4F1\uB85D/;
const UNTIL_EXHAUSTED_PATTERN = /\uC120\uCC29\uC21C|\uBAA8\uC9D1\uC2DC\uAE4C\uC9C0|\uCDA9\uC6D0\s*\uC2DC|\uB9C8\uAC10\s*\uC2DC|\uC18C\uC9C4\s*\uC2DC/;
const ONGOING_PATTERN = /\uC0C1\uC2DC|\uC218\uC2DC/;
const MANUAL_DEADLINE_OVERRIDES = {
  "425fb7e9-cf17-41ab-adac-4f41be556f65": "2026-09-27",
  "3cd803a8-1aee-4202-b22b-dee9d391f6c7": "2026-09-13",
  "8e3157cb-ca2d-4177-a9e6-8a18756d7df3": "2026-09-20",
  "51891555-8693-4f65-9fab-75dbde50d6a1": "2026-09-15",
};

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
    global: { headers: { "X-Client-Info": "posterlink-date-only-review-approval" } },
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isDateOnlyReview(row) {
  const verification = asObject(row.field_verification);
  return asArray(verification.dateIssues).length > 0
    && asArray(verification.duplicateIssues).length === 0
    && asArray(verification.qualityIssues).length === 0
    && asArray(verification.classificationIssues).length === 0;
}

function inferDeadlineType(row, finalEnd) {
  if (finalEnd) return "fixed";
  const text = compact([row.title, row.summary_short, row.summary_long].join("\n"));
  if (ONGOING_PATTERN.test(text)) return "ongoing";
  if (OPEN_ENDED_PATTERN.test(text) && UNTIL_EXHAUSTED_PATTERN.test(text)) return "until_exhausted";
  return row.deadline_type && row.deadline_type !== "fixed" ? row.deadline_type : "unknown";
}

function stripDateIssues(verification, review) {
  const next = { ...asObject(verification) };
  next.dateIssues = [];
  next.deadlineMatches = true;
  next.decision = (
    asArray(next.duplicateIssues).length > 0
    || asArray(next.qualityIssues).length > 0
    || asArray(next.classificationIssues).length > 0
  ) ? "needs_review" : "approved";
  next.dateQuality = {
    ...asObject(next.dateQuality),
    decision: "pass",
    normalizedDeadline: review.finalApplicationEndAt,
    suggestedDeadline: review.finalApplicationEndAt,
    reviewedBy: "date-only-review-approval-20260906",
    reviewedAt: new Date().toISOString(),
  };
  next.dateReview = review;
  return next;
}

function kstDateKey(value) {
  const iso = normalizeDateOnly(value);
  if (iso) return iso;
  const time = Date.parse(String(value ?? ""));
  if (Number.isNaN(time)) return null;
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function contextYear(row) {
  const currentYear = Number(TODAY_KST.slice(0, 4));
  const years = compact([row.title, row.summary_short, row.summary_long, row.created_at].join(" "))
    .match(/\b20\d{2}\b/g)
    ?.map(Number)
    .filter((year) => year >= currentYear - 1 && year <= currentYear + 1) ?? [];
  return years.length > 0 ? Math.max(...years) : currentYear;
}

function correctYearFromContext(row, isoDate) {
  if (!isoDate) return null;
  const previousIssueCodes = asArray(row.field_verification?.dateIssues).map((issue) => issue.code);
  if (!previousIssueCodes.includes("date-without-year")) return isoDate;
  const year = contextYear(row);
  const currentYear = Number(isoDate.slice(0, 4));
  if (!year || currentYear >= year) return isoDate;
  return `${year}${isoDate.slice(4)}`;
}

function buildPlan(row) {
  const recomputedDateQuality = evaluatePosterDateQuality({
    title: row.title,
    source_org_name: row.source_org_name,
    summary_short: row.summary_short,
    summary_long: row.summary_long,
    application_end_at: row.application_end_at,
  }, { extractedDeadline: row.application_end_at });

  const existingDateQuality = asObject(row.field_verification?.dateQuality);
  const recomputedEnd = chooseDeadlineForStorage(row.application_end_at, recomputedDateQuality);
  const fallbackEnd = normalizeDateOnly(existingDateQuality.suggestedDeadline)
    ?? normalizeDateOnly(existingDateQuality.normalizedDeadline)
    ?? normalizeDateOnly(row.field_verification?.correctedDeadline)
    ?? normalizeDateOnly(row.application_end_at);
  const recomputedIssueCodes = new Set(recomputedDateQuality.issues.map((issue) => issue.code));
  const previousIssueCodes = asArray(row.field_verification?.dateIssues).map((issue) => issue.code);
  const isOpenEndedWithoutClearEnd = recomputedIssueCodes.has("open-ended-application-period")
    && previousIssueCodes.includes("open-ended-application-period")
    && !recomputedIssueCodes.has("missing-clear-deadline")
    && !recomputedIssueCodes.has("deadline-mismatch");
  const finalEnd = MANUAL_DEADLINE_OVERRIDES[row.id]
    ?? (isOpenEndedWithoutClearEnd ? null : correctYearFromContext(row, recomputedEnd ?? fallbackEnd));
  const deadlineType = inferDeadlineType(row, finalEnd);
  const nextStatus = finalEnd && finalEnd < TODAY_KST ? "closed" : "published";
  const review = {
    reviewer: "codex",
    reviewedAt: new Date().toISOString(),
    source: "stored source text and deterministic application-period parser",
    previousDateIssues: asArray(row.field_verification?.dateIssues).map((issue) => issue.code).filter(Boolean),
    recomputedDateQuality,
    previousApplicationEndAt: kstDateKey(row.application_end_at),
    finalApplicationEndAt: finalEnd,
    finalDeadlineType: deadlineType,
    finalStatus: nextStatus,
  };

  return {
    id: row.id,
    title: row.title,
    source_key: row.source_key,
    evidence: compact([row.summary_short, row.summary_long].join(" ")).slice(0, 900),
    previous: {
      poster_status: row.poster_status,
      verification_status: row.verification_status,
      application_start_at: kstDateKey(row.application_start_at),
      application_end_at: kstDateKey(row.application_end_at),
      deadline_type: row.deadline_type,
      dateIssues: review.previousDateIssues,
    },
    next: {
      poster_status: nextStatus,
      verification_status: row.verification_status,
      application_start_at: normalizeDateOnly(row.application_start_at),
      application_end_at: finalEnd,
      deadline_type: deadlineType,
      published_at: new Date().toISOString(),
      rejection_reason: null,
      field_verification: stripDateIssues(row.field_verification, review),
    },
  };
}

async function fetchCandidates(supabase, limit) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,verification_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type,source_key,summary_short,summary_long,field_verification,created_at")
      .eq("poster_status", "review")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.filter(isDateOnlyReview).slice(0, limit);
}

async function applyPlans(supabase, plans) {
  const applied = [];
  for (const plan of plans) {
    const { data, error } = await supabase
      .from("posters")
      .update(plan.next)
      .eq("id", plan.id)
      .eq("poster_status", "review")
      .select("id,poster_status,application_end_at,deadline_type")
      .maybeSingle();
    if (error) throw error;
    if (data) applied.push(data);
  }

  if (applied.length > 0) {
    const { error } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "date_only_review_bulk_approval",
      metadata_json: {
        approved_scope: "date-only review posters approved by Codex on operator request",
        today_kst: TODAY_KST,
        affected_count: applied.length,
        statuses: plans.reduce((acc, plan) => {
          acc[plan.next.poster_status] = (acc[plan.next.poster_status] ?? 0) + 1;
          return acc;
        }, {}),
      },
    });
    if (error) throw error;
  }

  return applied;
}

async function main() {
  const args = parseArgs();
  const limit = Math.max(1, Number(args.limit ?? 1000));
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }

  const supabase = createSupabase();
  const candidates = await fetchCandidates(supabase, limit);
  const plans = candidates.map(buildPlan);
  const applied = apply ? await applyPlans(supabase, plans) : [];
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    today_kst: TODAY_KST,
    candidate_count: candidates.length,
    applied_count: applied.length,
    status_counts: plans.reduce((acc, plan) => {
      acc[plan.next.poster_status] = (acc[plan.next.poster_status] ?? 0) + 1;
      return acc;
    }, {}),
    changed_deadline_count: plans.filter((plan) => plan.previous.application_end_at !== plan.next.application_end_at).length,
    plans,
  };

  const outputPath = path.resolve(REPO_ROOT, args.output ?? DEFAULT_OUTPUT);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, outputPath),
    mode: report.mode,
    today_kst: TODAY_KST,
    candidate_count: report.candidate_count,
    applied_count: report.applied_count,
    status_counts: report.status_counts,
    changed_deadline_count: report.changed_deadline_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
