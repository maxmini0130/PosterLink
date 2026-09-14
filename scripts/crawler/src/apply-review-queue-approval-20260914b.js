#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REVIEW_QUEUE_APPROVAL_20260914B";
const REPORT_DEFAULT = "data/results/review-queue-approval-20260914b.json";
const REVIEWER = "codex-review-queue-20260914b";

const DECISIONS = [
  {
    id: "688e9df8-aaee-4364-a8a9-753ba13a600c",
    status: "published",
    appStart: "2026-08-31",
    eventStart: "2026-09-19",
    eventEnd: "2026-09-19",
    deadlineType: "until_exhausted",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Gangseo youth-center donation craft workshop accepts applications from 2026-08-31 until capacity fills; event is 2026-09-19.",
    links: [
      ["official_apply", "담당기관 바로가기", "https://forms.gle/fMfsCeYeSSEJVqqB7", true],
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73456", false],
    ],
  },
  {
    id: "1d48c7a9-423d-44f3-97e7-f9e5297cd0ec",
    status: "published",
    appStart: "2026-09-04",
    appEnd: "2026-09-14",
    eventStart: "2026-09-18",
    eventEnd: "2026-09-18",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Seongdong youth-center meetup recruitment runs 2026-09-04 to 2026-09-14 23:59; event is 2026-09-18.",
    links: [
      ["official_apply", "담당기관 바로가기", "https://docs.google.com/forms/d/e/1FAIpQLSeBN7WqN_ytDm3dbkPVzMJ18Qv1v9IMNG3GsV5xp9t3jN3Uvg/viewform", true],
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73989", false],
    ],
  },
  {
    id: "78a1edbe-803c-44d3-829b-131700eb2925",
    status: "published",
    eventStart: "2026-10-14",
    eventEnd: "2026-10-28",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_LIFE_INFO"],
    reason: "Mapo youth-center finance education has sessions on 2026-10-14, 2026-10-21, and 2026-10-28; no fixed application deadline is stated, and the stored 2023 date was stale.",
  },
  {
    id: "c1015399-16ee-4c11-b6d6-7cc374d6c3bf",
    status: "published",
    appStart: "2026-09-14",
    eventStart: "2026-10-13",
    eventEnd: "2026-10-27",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_LIFE_INFO"],
    reason: "Gwanak one-person household program recruitment starts 2026-09-14 10:00 with no fixed end date; sessions run 2026-10-13, 10-20, and 10-27.",
  },
  {
    id: "520eff73-918b-4899-b7fd-523c72bbf3d8",
    status: "published",
    appStart: "2026-09-15",
    eventStart: "2026-09-22",
    eventEnd: "2026-09-22",
    deadlineType: "until_exhausted",
    categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"],
    reason: "Gayang library author talk opens applications on 2026-09-15 and is first-come; event is 2026-09-22.",
  },
  {
    id: "389de78e-5520-4cdc-8449-928604170aee",
    status: "published",
    appStart: "2026-09-20",
    eventStart: "2026-10-01",
    eventEnd: "2026-10-29",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_CULTURE"],
    reason: "Poetry healing library class opens applications on 2026-09-20 until capacity fills; class runs weekly from 2026-10-01 to 2026-10-29.",
  },
  {
    id: "a1c2d0e0-0ae9-49c7-b431-4ec42d2de204",
    status: "published",
    appEnd: "2026-09-16",
    deadlineType: "fixed",
    categories: ["CAT_RECRUITMENT", "CAT_COURSE"],
    reason: "Fashion-design job matching program application deadline is 2026-09-16 for youth job seekers.",
  },
  {
    id: "e0d59efc-7992-4854-b81d-cafa5c1683b3",
    status: "published",
    appStart: "2026-09-22",
    eventStart: "2026-10-10",
    eventEnd: "2026-11-28",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_CULTURE"],
    reason: "Woojangsan forest library writing program opens applications on 2026-09-22 until capacity fills; program runs 2026-10-10 to 2026-11-28.",
  },
  {
    id: "94f467e6-8fd1-44dc-a993-920dcd8540c2",
    status: "published",
    appStart: "2026-09-21",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_CULTURE"],
    reason: "Gomdallae library October picture-book copy club opens applications on 2026-09-21 and is first-come; no precise event date is stated in stored source text.",
  },
  {
    id: "5487e7dd-cae8-498d-8bff-b514c0f8b658",
    status: "published",
    appEnd: "2026-09-20",
    eventStart: "2026-09-20",
    eventEnd: "2026-09-20",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Songpa youth festival matching program is a real participant event on 2026-09-20; no separate earlier deadline is stated.",
  },
  {
    id: "e96b5d26-244a-4712-b564-1bf0c28d86e7",
    status: "published",
    appStart: "2026-09-11",
    eventStart: "2026-09-18",
    eventEnd: "2026-09-18",
    deadlineType: "until_exhausted",
    categories: ["CAT_COURSE", "CAT_CULTURE"],
    reason: "Onggi small library water-origin lecture opens applications on 2026-09-11 until capacity fills; event is 2026-09-18.",
  },
  {
    id: "e78f9f48-89d7-462f-9d1f-f30749c3386c",
    status: "published",
    appStart: "2026-09-08",
    appEnd: "2026-09-19",
    eventStart: "2026-09-19",
    eventEnd: "2026-09-19",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"],
    reason: "Gayang library world-music anniversary event application period is 2026-09-08 to 2026-09-19; event is 2026-09-19.",
  },
  {
    id: "b5a9a481-2115-469e-9ccd-655f9709fa7f",
    status: "published",
    appEnd: "2026-09-16",
    eventStart: "2026-09-16",
    eventEnd: "2026-09-16",
    deadlineType: "fixed",
    categories: ["CAT_COURSE", "CAT_RECRUITMENT"],
    reason: "Seoul youth allowance AI insight lecture and mentoring is on 2026-09-16 and is first-come for selected youth allowance participants.",
  },
  {
    id: "11d9494a-2d12-4c16-8f31-5d21eb5b2252",
    status: "published",
    appStart: "2026-09-14",
    appEnd: "2026-10-09",
    eventStart: "2026-10-16",
    eventEnd: "2026-10-16",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Seoul Grand Park citizen safety inspection group application period is 2026-09-14 to 2026-10-09; inspection is planned for 2026-10-16.",
  },
  {
    id: "1dadef99-5c18-45d9-8b3b-0fd9bd97678f",
    status: "published",
    appStart: "2026-09-11",
    appEnd: "2026-09-22",
    eventStart: "2026-10-21",
    eventEnd: "2026-10-25",
    deadlineType: "fixed",
    categories: ["CAT_BUSINESS", "CAT_EVENT_RECRUIT"],
    reason: "Local cafe and dessert brand popup recruitment runs 2026-09-11 to 2026-09-22; popup event runs 2026-10-21 to 2026-10-25.",
  },
  {
    id: "1bf49452-ea49-443e-90bd-1ec8e84ac6f7",
    status: "published",
    appStart: "2026-09-14",
    appEnd: "2026-09-30",
    deadlineType: "fixed",
    categories: ["CAT_SUPPORT_PROGRAM", "CAT_HEALTH"],
    reason: "Seoul medical-friendly accommodation selection accepts applications from 2026-09-14 10:00 to 2026-09-30 18:00.",
    links: [
      ["official_apply", "공식 신청 링크", "https://forms.gle/ENNSPuT1xZYHjXF6A", true],
      ["official_apply", "2026 서울의료친화 숙박시설 선정 신청_서식01~04.hwp", "https://seoulboard.seoul.go.kr/comm/getFile?srvcId=BBSTY1&upperNo=466309&fileTy=ATTACH&fileNo=2&bbsNo=277", false],
      ["official_apply", "2026 서울의료친화 숙박시설 선정 신청_서식05.xlsx", "https://seoulboard.seoul.go.kr/comm/getFile?srvcId=BBSTY1&upperNo=466309&fileTy=ATTACH&fileNo=3&bbsNo=277", false],
      ["official_notice", "공식 공고 원문", "https://www.seoul.go.kr/news/news_notice.do?bbsNo=277&nttNo=466309", false],
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
    global: { headers: { "X-Client-Info": "posterlink-review-approval-20260914b" } },
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
    todayKst: "2026-09-14",
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
      action_reason: "review_queue_approval_20260914b",
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
    applied_count: applied.length,
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
    applied_count: report.applied_count,
    skipped_count: report.skipped_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
