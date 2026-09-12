#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REVIEW_QUEUE_APPROVAL_20260912B";
const REPORT_DEFAULT = "data/results/review-queue-approval-20260912b.json";
const REVIEWER = "codex-review-queue-20260912b";

const DECISIONS = [
  {
    id: "e939e3e2-7833-4e5d-b455-aadaffc8cbc0",
    status: "published",
    appStart: "2026-09-03",
    appEnd: "2026-10-25",
    deadlineType: "fixed",
    categories: ["CAT_COURSE", "CAT_BUSINESS"],
    reason: "K-Startup source states application period 2026-09-03 09:00 to 2026-10-25 17:00 for a startup academy.",
  },
  {
    id: "c8fe52c6-185f-42ee-82bb-be8f82523501",
    status: "published",
    appStart: "2026-09-09",
    appEnd: "2026-09-15",
    eventStart: "2026-09-15",
    eventEnd: "2026-09-17",
    deadlineType: "fixed",
    categories: ["CAT_COURSE", "CAT_BUSINESS"],
    reason: "Application closes 2026-09-15 13:50; local-startup education sessions run 2026-09-15 and 2026-09-17.",
  },
  {
    id: "8a4a4609-ecb3-4afc-8708-2c0003ec31ed",
    status: "published",
    appStart: "2026-09-09",
    appEnd: "2026-09-15",
    eventStart: "2026-09-15",
    eventEnd: "2026-09-15",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"],
    reason: "Application closes 2026-09-15 12:00; business briefing event is 2026-09-15 14:00-15:00.",
  },
  {
    id: "49243199-d897-48e7-b2fc-2468164d2a72",
    status: "published",
    appStart: "2026-09-07",
    appEnd: "2026-09-16",
    deadlineType: "fixed",
    categories: ["CAT_SUPPORT_PROGRAM", "CAT_BUSINESS"],
    reason: "Tourism AI barrier-free project recruits companies from 2026-09-07 to 2026-09-16 11:00 with commercialization support.",
  },
  {
    id: "2c35699c-6102-47d2-8201-a9483ae60854",
    status: "published",
    appStart: "2026-09-10",
    appEnd: "2026-10-14",
    eventStart: "2026-10-15",
    eventEnd: "2026-10-15",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_BUSINESS"],
    reason: "Global startup summit seminar/meetup applications run 2026-09-10 to 2026-10-14; event is 2026-10-15.",
  },
  {
    id: "4be364ed-d283-44e3-ab6a-bf34d7d9a21a",
    status: "published",
    appStart: "2026-09-09",
    appEnd: "2026-09-30",
    eventStart: "2026-10-14",
    eventEnd: "2026-10-14",
    deadlineType: "fixed",
    categories: ["CAT_SUPPORT_PROGRAM", "CAT_BUSINESS"],
    reason: "IR-round application is 2026-09-09 to 2026-09-30; selected startups meet investors on 2026-10-14.",
  },
  {
    id: "40e60971-0fe5-4963-bf6d-e02a20ee54e9",
    status: "published",
    appEnd: "2026-09-19",
    eventStart: "2026-09-17",
    eventEnd: "2026-09-19",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Stored 2023 year was stale; source context is the 2026 youth feed and the open pop-up runs 2026-09-17 to 2026-09-19.",
  },
  {
    id: "f4aed794-e8f6-4bbd-bd9b-2e2cc5e21253",
    status: "published",
    appStart: "2026-09-07",
    appEnd: "2026-09-23",
    eventStart: "2026-10-06",
    eventEnd: "2026-10-06",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Single-person household talk show applications run 2026-09-07 to 2026-09-23; event is 2026-10-06.",
  },
  {
    id: "6864b1a1-9eff-4175-a940-7c884b6abef0",
    status: "published",
    appStart: "2026-09-08",
    appEnd: "2026-09-13",
    eventStart: "2026-09-18",
    eventEnd: "2026-09-18",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "One-person household day-trip recruitment runs 2026-09-08 to 2026-09-13; trip is 2026-09-18.",
    links: [
      ["official_apply", "동작구민 1인가구 신청", "https://forms.gle/xACbj9h7PYGyqf229", true],
      ["official_apply", "취약 1인가구 신청", "https://forms.gle/KubW8cSmPDbsTCtz6", false],
      ["official_notice", "공식 공고 원문", "https://1in.seoul.go.kr/front/partcptn/partcptnView.do?CSRF_TOKEN=15584184-494a-4603-80dc-c5542d750485&miv_pageNo=2&miv_pageSize=10&total_cnt=&LISTOP=miv_pageNo%253D1%253B_SERIALISVALID%253DT%253Bmiv_pageSize%253D15%253B&mode=W&partcptn_id=775f822ca12d4e88979fdbb0a5a1d74c&p_ty=TC01%2CTC02%2CTC03%2CTC04&p_atdrc=1100000000%2C1111000000%2C1114000000%2C1117000000%2C1120000000%2C1121500000%2C1123000000", false],
    ],
  },
  {
    id: "5c7a30d3-b1dc-44dc-8eda-579bd3c76661",
    status: "published",
    appEnd: "2026-09-12",
    eventStart: "2026-09-11",
    eventEnd: "2026-09-12",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"],
    reason: "Open youth illustration exhibition runs 2026-09-11 to 2026-09-12 and is still active on 2026-09-12.",
  },
  {
    id: "96681369-39be-4c43-b2c6-255f11555a2a",
    status: "published",
    appStart: "2026-08-31",
    appEnd: null,
    eventStart: "2026-09-18",
    eventEnd: "2026-09-18",
    deadlineType: "until_exhausted",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Gangseo youth center notice says applications run from 2026-08-31 until capacity fills; workshop is 2026-09-18.",
    links: [
      ["official_apply", "담당기관 바로가기", "https://forms.gle/XWdKWCSB2dsSF5Vr6", true],
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73435", false],
    ],
  },
  {
    id: "9f6f004b-c2ba-4be2-baea-213955f76a4b",
    status: "published",
    appEnd: "2026-09-27",
    eventStart: "2026-10-08",
    eventEnd: "2026-10-27",
    deadlineType: "fixed",
    categories: ["CAT_RECRUITMENT", "CAT_COURSE"],
    reason: "Career-prep program application closes 2026-09-27 23:59; offline curriculum runs 2026-10-08 to 2026-10-27.",
  },
  {
    id: "587b894f-3355-4fef-9137-99573a813515",
    status: "published",
    appEnd: "2026-09-16",
    eventStart: "2026-09-17",
    eventEnd: "2026-09-17",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_POLICY_INFO"],
    reason: "Youth-issue mini lab has advance application until 2026-09-16 13:00 and event on 2026-09-17.",
    links: [
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73986", true],
    ],
  },
  {
    id: "2abdc751-090b-49ba-b4da-7a964536d62a",
    status: "published",
    appEnd: "2026-09-19",
    eventStart: "2026-09-04",
    eventEnd: "2026-09-19",
    deadlineType: "fixed",
    categories: ["CAT_POLICY_INFO", "CAT_EVENT_RECRUIT"],
    reason: "This is a useful 2026 Youth Day festival guide; events run through 2026-09-19, so the stale 2026-09-04 deadline was corrected to the final event date.",
    links: [
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73984", true],
    ],
  },
];

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
    global: { headers: { "X-Client-Info": "posterlink-review-approval-20260912b" } },
  });
}

function toKstStart(date) {
  return date ? `${date}T00:00:00+09:00` : null;
}

function toKstEnd(date) {
  return date ? `${date}T23:59:59+09:00` : null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeVerification(row, decision, categoryNamesByCode) {
  const now = new Date().toISOString();
  const verification = { ...asObject(row.field_verification) };
  verification.dateIssues = [];
  verification.classificationIssues = [];
  verification.deadlineMatches = true;
  verification.decision = "approved";
  verification.reason = `AI direct queue review approved: ${decision.reason}`;
  verification.dateQuality = {
    ...asObject(verification.dateQuality),
    decision: "pass",
    storedDeadline: decision.appEnd ?? null,
    normalizedDeadline: decision.appEnd ?? null,
    suggestedDeadline: decision.appEnd ?? null,
    reviewedAt: now,
    reviewedBy: REVIEWER,
  };
  verification.classification = {
    ...asObject(verification.classification),
    categoryCodes: decision.categories,
    primaryCategory: decision.categories[0],
    categories: decision.categories.map((code) => ({
      code,
      label: categoryNamesByCode.get(code) ?? code,
      confidence: 0.9,
      evidence: decision.reason,
      source: REVIEWER,
    })),
    confidence: 0.9,
    reason: decision.reason,
    updatedBy: REVIEWER,
    updatedAt: now,
  };
  verification.aiQueueReview = {
    reviewer: "codex",
    reviewedAt: now,
    todayKst: "2026-09-12",
    approve: true,
    finalStatus: decision.status,
    finalDeadlineType: decision.deadlineType,
    finalApplicationStartAt: decision.appStart ?? null,
    finalApplicationEndAt: decision.appEnd ?? null,
    finalEventStartAt: decision.eventStart ?? null,
    finalEventEndAt: decision.eventEnd ?? null,
    finalCategories: decision.categories,
    reason: decision.reason,
  };
  return verification;
}

async function replaceCategories(supabase, decision, categoryByCode) {
  const { error: deleteError } = await supabase
    .from("poster_categories")
    .delete()
    .eq("poster_id", decision.id);
  if (deleteError) throw deleteError;

  const rows = decision.categories.map((code) => ({
    poster_id: decision.id,
    category_id: categoryByCode.get(code).id,
  }));
  const { error: insertError } = await supabase.from("poster_categories").insert(rows);
  if (insertError) throw insertError;
}

async function replaceLinks(supabase, decision) {
  if (!decision.links) return;
  const { error: deleteError } = await supabase
    .from("poster_links")
    .delete()
    .eq("poster_id", decision.id);
  if (deleteError) throw deleteError;

  const rows = decision.links.map(([linkType, title, url, isPrimary]) => ({
    poster_id: decision.id,
    link_type: linkType,
    title,
    url,
    is_primary: Boolean(isPrimary),
  }));
  const { error: insertError } = await supabase.from("poster_links").insert(rows);
  if (insertError) throw insertError;
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }

  const supabase = createSupabase();
  const ids = DECISIONS.map((decision) => decision.id);
  const [{ data: rows, error: rowsError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("posters").select("id,title,poster_status,field_verification").in("id", ids),
    supabase.from("categories").select("id,code,name"),
  ]);
  if (rowsError) throw rowsError;
  if (categoriesError) throw categoriesError;

  const rowById = new Map((rows ?? []).map((row) => [row.id, row]));
  const categoryByCode = new Map((categories ?? []).map((row) => [row.code, row]));
  const categoryNamesByCode = new Map((categories ?? []).map((row) => [row.code, row.name]));
  const missing = ids.filter((id) => !rowById.has(id));
  if (missing.length) throw new Error(`Missing posters: ${missing.join(", ")}`);

  const applied = [];
  const skipped = [];
  for (const decision of DECISIONS) {
    const row = rowById.get(decision.id);
    for (const code of decision.categories) {
      if (!categoryByCode.has(code)) throw new Error(`Unknown category ${code} for ${decision.id}`);
    }
    if (row.poster_status !== "review") {
      skipped.push({ id: decision.id, title: row.title, status: row.poster_status, reason: "not_review" });
      continue;
    }
    if (!apply) {
      applied.push({
        id: decision.id,
        title: row.title,
        plannedStatus: decision.status,
        categories: decision.categories,
        reason: decision.reason,
        dryRun: true,
      });
      continue;
    }

    const posterUpdate = {
      poster_status: decision.status,
      published_at: new Date().toISOString(),
      rejection_reason: null,
      application_start_at: toKstStart(decision.appStart),
      application_end_at: toKstEnd(decision.appEnd),
      event_start_at: toKstStart(decision.eventStart),
      event_end_at: toKstEnd(decision.eventEnd),
      deadline_type: decision.deadlineType,
      field_verification: mergeVerification(row, decision, categoryNamesByCode),
    };
    const { data: updated, error: updateError } = await supabase
      .from("posters")
      .update(posterUpdate)
      .eq("id", decision.id)
      .eq("poster_status", "review")
      .select("id,title,poster_status,application_start_at,application_end_at,event_start_at,event_end_at,deadline_type")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      skipped.push({ id: decision.id, title: row.title, reason: "update_race" });
      continue;
    }

    await replaceCategories(supabase, decision, categoryByCode);
    await replaceLinks(supabase, decision);
    applied.push({ ...updated, category_codes: decision.categories, reason: decision.reason });
  }

  if (apply && applied.length > 0) {
    const { error } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: null,
      action_type: "approve",
      action_reason: "review_queue_approval_20260912b",
      metadata_json: {
        reviewed_by: "codex",
        approved_count: applied.length,
        skipped_count: skipped.length,
        cleaned_link_count: DECISIONS.filter((decision) => decision.links).length,
        no_exposure_tier_changes: true,
      },
    });
    if (error) throw error;
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    input_count: DECISIONS.length,
    approved_count: applied.length,
    skipped_count: skipped.length,
    skipped,
    applied,
  };
  const output = path.resolve(args.output ?? REPORT_DEFAULT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output: path.relative(process.cwd(), output),
    mode: report.mode,
    input_count: report.input_count,
    approved_count: report.approved_count,
    skipped_count: report.skipped_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
