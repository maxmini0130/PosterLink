#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_DDM_ACADEMY_DUPLICATE_20260912";
const OUTPUT_DEFAULT = "data/results/ddm-academy-duplicate-resolution-20260912.json";
const APPROVE_ID = "b8513929-5175-4fdd-abdf-027e06987d68";
const REJECT_ID = "0816e7c6-bb6f-4cf4-bc8c-dbcc29666af9";
const REVIEWER = "codex-ddm-academy-duplicate-resolution-20260912";
const CATEGORY_CODES = ["CAT_BUSINESS", "CAT_COURSE"];

function parseArgs() {
  return Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }));
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service role key are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-ddm-duplicate-resolution" } },
  });
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeApprovalVerification(row) {
  const now = new Date().toISOString();
  const verification = { ...asObject(row.field_verification) };
  verification.dateIssues = [];
  verification.duplicateIssues = [];
  verification.classificationIssues = [];
  verification.deadlineMatches = true;
  verification.decision = "approved";
  verification.reason = "AI duplicate resolution approved representative DDM academy notice: official Dongdaemun-gu notice is the canonical source; event and user-facing deadline are 2026-09-16.";
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: "pass",
    storedDeadline: "2026-09-16",
    normalizedDeadline: "2026-09-16",
    suggestedDeadline: "2026-09-16",
    reviewedAt: now,
    reviewedBy: REVIEWER,
  };
  verification.classification = {
    ...asObject(verification.classification),
    categoryCodes: CATEGORY_CODES,
    primaryCategory: "CAT_BUSINESS",
    categories: [
      {
        code: "CAT_BUSINESS",
        label: "소상공인",
        confidence: 0.9,
        evidence: "Startup/venture academy for people interested in entrepreneurship.",
        source: REVIEWER,
      },
      {
        code: "CAT_COURSE",
        label: "교육강좌",
        confidence: 0.9,
        evidence: "Academy/education event with a specific class date and application form.",
        source: REVIEWER,
      },
    ],
    confidence: 0.9,
    reason: "창업 관심자를 위한 벤처스타트업 아카데미 교육성 행사입니다.",
    updatedBy: REVIEWER,
    updatedAt: now,
  };
  verification.aiQueueReview = {
    reviewer: "codex",
    reviewedAt: now,
    todayKst: "2026-09-12",
    approve: true,
    duplicateResolution: true,
    rejectedDuplicateId: REJECT_ID,
    finalStatus: "published",
    finalDeadlineType: "fixed",
    finalApplicationEndAt: "2026-09-16",
    finalEventStartAt: "2026-09-16",
    finalEventEndAt: "2026-09-16",
    finalCategories: CATEGORY_CODES,
    reason: "동대문구청 공식 원문과 동일 Google Form 신청 링크가 있는 레코드를 대표로 승인.",
  };
  return verification;
}

function mergeRejectVerification(row) {
  const now = new Date().toISOString();
  const verification = { ...asObject(row.field_verification) };
  verification.decision = "rejected";
  verification.reason = `AI duplicate resolution rejected duplicate of ${APPROVE_ID}. Same DDM academy notice, same 2026-09-16 event, same Google Form application URL.`;
  verification.duplicateResolution = {
    reviewer: "codex",
    reviewedAt: now,
    duplicateOf: APPROVE_ID,
    rejectedAsDuplicate: true,
    reason: "동일 행사/동일 신청 링크/동일 일시의 중복 레코드이며, 동대문구청 공식 원문이 붙은 레코드를 대표 승인했습니다.",
  };
  return verification;
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }

  const supabase = createSupabase();
  const [{ data: rows, error: rowsError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase
      .from("posters")
      .select("id,title,poster_status,field_verification")
      .in("id", [APPROVE_ID, REJECT_ID]),
    supabase.from("categories").select("id,code,name").in("code", CATEGORY_CODES),
  ]);
  if (rowsError) throw rowsError;
  if (categoriesError) throw categoriesError;

  const rowById = new Map((rows ?? []).map((row) => [row.id, row]));
  const categoryByCode = new Map((categories ?? []).map((row) => [row.code, row]));
  for (const id of [APPROVE_ID, REJECT_ID]) {
    if (!rowById.has(id)) throw new Error(`Missing poster ${id}`);
  }
  for (const code of CATEGORY_CODES) {
    if (!categoryByCode.has(code)) throw new Error(`Missing category ${code}`);
  }

  const approvedRow = rowById.get(APPROVE_ID);
  const rejectedRow = rowById.get(REJECT_ID);
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    approve: {
      id: APPROVE_ID,
      title: approvedRow.title,
      before_status: approvedRow.poster_status,
      next_status: "published",
      categories: CATEGORY_CODES,
    },
    reject: {
      id: REJECT_ID,
      title: rejectedRow.title,
      before_status: rejectedRow.poster_status,
      next_status: "rejected",
      duplicate_of: APPROVE_ID,
    },
    applied: false,
  };

  if (apply) {
    const now = new Date().toISOString();
    const approvalUpdate = {
      poster_status: "published",
      published_at: now,
      rejection_reason: null,
      application_start_at: null,
      application_end_at: "2026-09-16T23:59:59+09:00",
      event_start_at: "2026-09-16T00:00:00+09:00",
      event_end_at: "2026-09-16T23:59:59+09:00",
      deadline_type: "fixed",
      field_verification: mergeApprovalVerification(approvedRow),
    };
    const { data: approved, error: approveError } = await supabase
      .from("posters")
      .update(approvalUpdate)
      .eq("id", APPROVE_ID)
      .eq("poster_status", "review")
      .select("id,title,poster_status,application_end_at,event_start_at,event_end_at,deadline_type")
      .maybeSingle();
    if (approveError) throw approveError;
    if (!approved) throw new Error(`Approval row was not updated: ${APPROVE_ID}`);

    const { error: deleteCategoryError } = await supabase
      .from("poster_categories")
      .delete()
      .eq("poster_id", APPROVE_ID);
    if (deleteCategoryError) throw deleteCategoryError;
    const { error: insertCategoryError } = await supabase.from("poster_categories").insert(
      CATEGORY_CODES.map((code) => ({
        poster_id: APPROVE_ID,
        category_id: categoryByCode.get(code).id,
      })),
    );
    if (insertCategoryError) throw insertCategoryError;

    const { data: rejected, error: rejectError } = await supabase
      .from("posters")
      .update({
        poster_status: "rejected",
        rejection_reason: `중복 반려: ${APPROVE_ID} 대표 승인`,
        field_verification: mergeRejectVerification(rejectedRow),
      })
      .eq("id", REJECT_ID)
      .eq("poster_status", "review")
      .select("id,title,poster_status,rejection_reason")
      .maybeSingle();
    if (rejectError) throw rejectError;
    if (!rejected) throw new Error(`Reject row was not updated: ${REJECT_ID}`);

    const { error: actionError } = await supabase.from("admin_actions").insert([
      {
        actor_user_id: null,
        target_type: "poster",
        target_id: APPROVE_ID,
        action_type: "approve",
        action_reason: "ddm_academy_duplicate_resolution_20260912",
        metadata_json: { reviewed_by: "codex", duplicate_rejected_id: REJECT_ID },
      },
      {
        actor_user_id: null,
        target_type: "poster",
        target_id: REJECT_ID,
        action_type: "reject",
        action_reason: "ddm_academy_duplicate_resolution_20260912",
        metadata_json: { reviewed_by: "codex", duplicate_of: APPROVE_ID },
      },
    ]);
    if (actionError) throw actionError;

    report.applied = true;
    report.approve.after = approved;
    report.reject.after = rejected;
  }

  const output = path.resolve(args.output ?? OUTPUT_DEFAULT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(process.cwd(), output),
    mode: report.mode,
    applied: report.applied,
    approve: report.approve.id,
    reject: report.reject.id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
