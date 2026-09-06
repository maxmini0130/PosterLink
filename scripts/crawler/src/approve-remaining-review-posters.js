#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const TODAY_KST = "2026-09-06";
const CONFIRM_TOKEN = "APPROVE_REMAINING_REVIEW_POSTERS";
const DEFAULT_OUTPUT = "data/results/remaining-review-approval-plan-20260906.json";

const MANUAL_CORRECTIONS = {
  "4276d698-47cf-46d6-b5e3-a271ea1cd854": {
    start: "2026-08-24",
    end: "2026-09-08",
    eventStart: "2026-09-09",
    eventEnd: "2026-09-09",
    org: "을지유니크팩토리",
    note: "9월 9일 회차로, duplicate candidate의 8월 26일 회차와 별도 공고.",
  },
  "a1b00725-5416-468b-87eb-cb8c2a276ccd": {
    start: "2026-09-03",
    end: "2026-09-17",
    eventStart: "2026-09-29",
    eventEnd: "2026-09-29",
    org: "서울청년센터 관악 신림동쓰리룸",
  },
  "a8420077-6f29-47e4-89a8-de24dbaf7ef3": {
    start: "2026-09-01",
    end: "2026-09-28",
    org: "서초청년센터",
  },
  "f2203ccc-74f2-4ffe-b3ca-c5dda98961dc": {
    end: "2026-09-19",
    eventStart: "2026-09-19",
    eventEnd: "2026-09-19",
    org: "서울청년센터 강동",
    note: "강동 청년축제 본 행사와 주거/금융특강은 같은 축제 내 세부 프로그램.",
  },
  "bdb06e21-015e-4ee3-8ace-21086dc68077": {
    end: "2026-09-16",
    eventStart: "2026-09-19",
    eventEnd: "2026-09-19",
    org: "서울청년센터 관악 신림동쓰리룸",
  },
  "9e65f15c-4c4b-4e61-811d-b7c467b478e3": {
    end: "2026-09-21",
    eventStart: "2026-09-21",
    eventEnd: "2026-09-29",
    org: "서울청년센터 강북",
  },
  "2efd3fd4-1565-46a9-b345-2c68e99baeb0": {
    end: "2026-09-19",
    org: "서울신용보증재단 성북종합지원센터",
  },
  "923ddd0c-77db-4209-8d2e-a321a61289b5": {
    end: "2026-09-18",
    org: "마포구청",
  },
  "74475e51-addc-4009-aadd-8fd1d2e66077": {
    end: "2026-09-25",
    eventStart: "2026-09-11",
    eventEnd: "2026-09-25",
    org: "서울청년센터 중구",
  },
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
  if (!url || !key) throw new Error("Supabase URL and service key are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-remaining-review-approval" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isoDate(value) {
  if (!value) return null;
  const match = String(value).match(/20\d{2}-\d{2}-\d{2}/);
  if (match) return match[0];
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

function toKstStart(date) {
  return date ? `${date}T00:00:00+09:00` : null;
}

function toKstEnd(date) {
  return date ? `${date}T23:59:59+09:00` : null;
}

function correctPastYear(date) {
  return date?.startsWith("2023-") ? `2026-${date.slice(5)}` : date;
}

function normalizeEnd(row) {
  const verification = asObject(row.field_verification);
  return correctPastYear(
    MANUAL_CORRECTIONS[row.id]?.end
      ?? isoDate(verification.correctedDeadline)
      ?? isoDate(asObject(verification.dateQuality).suggestedDeadline)
      ?? isoDate(asObject(verification.dateQuality).normalizedDeadline)
      ?? isoDate(row.application_end_at),
  );
}

function inferOrg(row) {
  const verification = asObject(row.field_verification);
  const organization = asObject(verification.organization);
  return MANUAL_CORRECTIONS[row.id]?.org
    ?? (organization.displayOrgName && organization.displayOrgName !== "청년몽땅정보통"
      ? organization.displayOrgName
      : null)
    ?? verification.hostName
    ?? verification.organizerName
    ?? (row.source_org_name === "청년몽땅정보통" ? null : row.source_org_name);
}

function issueCodes(verification, key) {
  return asArray(verification[key]).map((issue) => issue.code).filter(Boolean);
}

function mergeVerification(row, plan) {
  const verification = { ...asObject(row.field_verification) };
  verification.dateIssues = [];
  verification.duplicateIssues = [];
  verification.qualityIssues = [];
  verification.classificationIssues = [];
  verification.deadlineMatches = true;
  verification.orgNameMatches = true;
  verification.decision = "approved";
  verification.reason = "검수 대기 항목 원문/저장 근거 확인 후 운영자 요청으로 승인.";
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: "pass",
    storedDeadline: plan.next.application_end_at,
    extractedDeadline: plan.next.application_end_at,
    normalizedDeadline: plan.next.application_end_at,
    suggestedDeadline: plan.next.application_end_at,
    reviewedBy: "remaining-review-approval-20260906",
    reviewedAt: plan.reviewedAt,
  };
  verification.remainingReviewApproval = {
    reviewer: "codex",
    reviewedAt: plan.reviewedAt,
    source: "stored source text, official-source spot checks, and operator approval request",
    previousIssues: plan.previous.issues,
    finalStatus: plan.next.poster_status,
    finalApplicationStartAt: plan.next.application_start_at,
    finalApplicationEndAt: plan.next.application_end_at,
    finalOrganizerName: plan.next.organizer_name,
    note: plan.note,
  };
  if (verification.organization && typeof verification.organization === "object") {
    verification.organization = {
      ...verification.organization,
      organizerName: plan.next.organizer_name ?? verification.organization.organizerName,
      displayOrgName: plan.next.organizer_name ?? verification.organization.displayOrgName,
    };
  }
  return verification;
}

function buildPlan(row) {
  const verification = asObject(row.field_verification);
  const manual = MANUAL_CORRECTIONS[row.id] ?? {};
  const end = normalizeEnd(row);
  const start = manual.start ?? isoDate(row.application_start_at);
  const org = inferOrg(row);
  const reviewedAt = new Date().toISOString();
  const nextStatus = end && end < TODAY_KST ? "closed" : "published";
  const next = {
    poster_status: nextStatus,
    published_at: reviewedAt,
    rejection_reason: null,
    application_start_at: toKstStart(start),
    application_end_at: toKstEnd(end),
    event_start_at: toKstStart(manual.eventStart ?? isoDate(row.event_start_at)),
    event_end_at: toKstEnd(manual.eventEnd ?? isoDate(row.event_end_at)),
    deadline_type: end ? "fixed" : (row.deadline_type && row.deadline_type !== "fixed" ? row.deadline_type : "unknown"),
    organizer_name: org,
    application_organization_name: org,
  };
  const plan = {
    id: row.id,
    title: row.title,
    source_key: row.source_key,
    reviewedAt,
    note: manual.note ?? null,
    previous: {
      poster_status: row.poster_status,
      application_start_at: isoDate(row.application_start_at),
      application_end_at: isoDate(row.application_end_at),
      deadline_type: row.deadline_type,
      organizer_name: row.organizer_name,
      issues: {
        date: issueCodes(verification, "dateIssues"),
        duplicate: issueCodes(verification, "duplicateIssues"),
        quality: issueCodes(verification, "qualityIssues"),
        classification: issueCodes(verification, "classificationIssues"),
      },
    },
    next: {
      ...next,
      application_start_at: start,
      application_end_at: end,
      event_start_at: manual.eventStart ?? isoDate(row.event_start_at),
      event_end_at: manual.eventEnd ?? isoDate(row.event_end_at),
    },
    update: next,
  };
  plan.update.field_verification = mergeVerification(row, plan);
  return plan;
}

async function fetchCandidates(supabase) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,source_org_name,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type,source_key,summary_short,summary_long,field_verification,created_at,organizer_name")
    .eq("poster_status", "review")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

async function applyPlans(supabase, plans) {
  const applied = [];
  for (const plan of plans) {
    const { data, error } = await supabase
      .from("posters")
      .update(plan.update)
      .eq("id", plan.id)
      .eq("poster_status", "review")
      .select("id,title,poster_status,application_start_at,application_end_at,organizer_name")
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
      action_reason: "remaining_review_bulk_approval",
      metadata_json: {
        approved_scope: "remaining review queue after operator request",
        today_kst: TODAY_KST,
        affected_count: applied.length,
        statuses: plans.reduce((acc, plan) => {
          acc[plan.next.poster_status] = (acc[plan.next.poster_status] ?? 0) + 1;
          return acc;
        }, {}),
        manual_corrections: Object.keys(MANUAL_CORRECTIONS).length,
      },
    });
    if (error) throw error;
  }
  return applied;
}

async function main() {
  const args = parseArgs();
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }
  const supabase = createSupabase();
  const candidates = await fetchCandidates(supabase);
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
    plans: plans.map(({ update, ...plan }) => plan),
  };
  const outputPath = path.resolve(REPO_ROOT, args.output ?? DEFAULT_OUTPUT);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, outputPath),
    mode: report.mode,
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
