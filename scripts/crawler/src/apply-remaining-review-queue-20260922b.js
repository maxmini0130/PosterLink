#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REMAINING_REVIEW_QUEUE_20260922B";
const DECISIONS = [
  { id: "93c0a228-7022-47fa-8b56-1a9656cd7882", status: "published", appStart: "2026-09-21", appEnd: "2026-10-18", eventStart: "2026-10-07", eventEnd: "2026-10-21", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "The two official reservation records cover October 7 and 21, 2026; each closes three days before its session, so the final user-facing deadline is October 18." },
  { id: "888e9aee-e918-40c9-9452-3d3659c0323b", status: "published", appEnd: "2026-10-01", eventStart: "2026-10-06", eventEnd: "2026-10-27", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "The 2026 title and Tuesday schedule corroborate the October 1 deadline and four October running-club sessions." },
  { id: "58b24c68-d7a7-442b-a09b-caf5b415954a", status: "published", appEnd: "2026-09-30", eventStart: "2026-09-30", eventEnd: "2026-09-30", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "The official text gives a September 30, 2026 job fair with advance registration or same-day on-site registration." },
  { id: "c12f3b8e-a4da-4002-9c2f-064a4547a2d8", status: "published", appStart: "2026-09-21", appEnd: "2026-10-11", eventStart: "2026-10-22", eventEnd: "2026-11-05", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "The Monday-to-Sunday recruitment period and all three Thursday squash sessions align with the 2026 calendar." },
  { id: "6a2951ca-70de-44bd-8f2f-aa2acc4b7c03", status: "published", appStart: "2026-09-10", eventStart: "2026-09-30", eventEnd: "2026-10-07", deadlineType: "until_exhausted", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "The notice explicitly recruits from September 10 until capacity is filled for two structured startup-branding lectures." },
  { id: "1e83ff7d-4510-44df-999d-87cce945088d", status: "published", appEnd: "2026-09-28", eventStart: "2026-10-06", eventEnd: "2026-10-27", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The title states 2026 and the Monday September 28 deadline plus four Tuesday cooking sessions align with the 2026 calendar, not 2023." },
  { id: "06c65405-08d3-4b08-9b74-a3090f99ec1b", status: "closed", appEnd: "2026-09-21", eventStart: "2026-09-23", eventEnd: "2026-11-19", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM", "CAT_EVENT_RECRUIT"], reason: "The source separately states a September 21 application deadline and a six-session September 23-November 19 activity period; applications have closed as of September 22." },
  { id: "564cb91d-3551-4210-a693-7f83b77c80fb", status: "published", appStart: "2026-09-21", appEnd: "2026-10-15", eventStart: "2026-10-16", eventEnd: "2026-11-06", deadlineType: "fixed", categories: ["CAT_HEALTH"], reason: "The official notice explicitly separates the September 21-October 15 recruitment period from four Friday mental-health art-therapy sessions." },
  { id: "34b777b8-8506-4a62-ad77-ed0278065861", status: "published", title: "계명대학교 대학일자리플러스센터 <JOB다한 상담소> 상담 신청", appEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM"], reason: "Poster verification confirms the JOB다한 counseling program and October 8 deadline; one-to-one career, resume, and interview counseling is a direct support service." },
  { id: "f26c5cb4-f278-4338-84e3-7edcd00b316e", status: "published", appStart: "2026-09-22", appEnd: "2026-10-13", eventStart: "2026-10-17", eventEnd: "2026-10-17", deadlineType: "fixed", categories: ["CAT_HOUSING", "CAT_COURSE"], reason: "The source explicitly gives the September 22-October 13 application period and October 17 SH public-rental housing lecture." },
  { id: "48b34b74-6493-4cfc-b4a8-2e84e01bf7ad", status: "published", appStart: "2026-09-21", appEnd: "2026-10-02", eventStart: "2026-10-07", eventEnd: "2026-10-07", deadlineType: "fixed", categories: ["CAT_HEALTH"], reason: "The official Seoul Welfare Foundation page verifies the application window and an October 7 isolation-prevention stretching and meditation session." },
  { id: "50f71324-fbcf-41f1-9c73-8216c907be63", status: "published", title: "서초구 <AI를 활용한 UI/UX 디자이너 과정> 참여자 모집", appStart: "2026-09-14", appEnd: "2026-10-13", eventStart: "2026-10-17", eventEnd: "2026-12-13", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The generic title is replaced with the grounded program name; the official text explicitly separates recruitment and weekend training periods." },
  { id: "09fbf810-3c79-412c-822a-89f61841229e", status: "published", appStart: "2026-09-28", appEnd: "2026-10-05", eventStart: "2026-10-08", eventEnd: "2026-11-26", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official notice explicitly states the September 28-October 5 recruitment period and October 8-November 26 gardener course." },
  { id: "3a3e60ae-44ec-406c-bed6-29ac00c364dd", status: "published", appEnd: "2026-10-11", eventStart: "2026-10-11", eventEnd: "2026-10-11", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "Poster verification matches the title, organizer, location, and October 11, 2026 event date; the public lesson has an official application form." },
  { id: "b18ae132-f434-4f8c-af33-c87da3f319a5", status: "published", eventStart: "2026-10-13", eventEnd: "2026-10-24", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_COURSE"], reason: "October 13 is the first program date rather than a stated application deadline; the multi-program recruitment remains open through its linked booking page without a fixed deadline in the source." },
  { id: "b23514aa-b6f2-47ad-9eb6-d8913b42dd51", status: "published", appStart: "2026-09-09", appEnd: "2026-09-28", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official listing explicitly identifies the 2026 pharmacy office-worker training and September 9-28 application period." },
  { id: "1f6572c7-06eb-4be6-9448-fe7c5b22bed2", status: "published", appStart: "2026-09-21", appEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official listing and poster evidence verify the September 21-October 8 application period for a practical home-repair class." },
  { id: "63398c86-e4a6-4f4b-b5f5-03d729e19ae7", status: "published", appEnd: "2026-09-30", eventStart: "2026-09-30", eventEnd: "2026-09-30", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official notice verifies a free September 30, 2026 humanities lecture with online and telephone registration; no earlier deadline is stated." },
  { id: "b7e2f706-6d43-41fa-aea6-84854d80be74", status: "published", appEnd: "2026-09-29", eventStart: "2026-10-02", eventEnd: "2026-10-02", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The source states an October 2, 2026 mentoring session and closes applications three days before the program." },
  { id: "91e47be3-d8a2-4201-8fdd-d3c9a617cf5f", status: "published", appStart: "2026-09-28", appEnd: "2026-10-05", eventStart: "2026-10-17", eventEnd: "2026-10-23", deadlineType: "fixed", categories: ["CAT_BUSINESS", "CAT_EVENT_RECRUIT"], reason: "The Seoul notice clearly separates the September 28-October 5 seller application period from the October 17-23 festival market operation period." },
];

const toStart = (date) => date ? `${date}T00:00:00+09:00` : null;
const toEnd = (date) => date ? `${date}T23:59:59+09:00` : null;

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service key are required");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  if (!process.argv.includes(`--confirm=${CONFIRM_TOKEN}`)) throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  const supabase = createSupabase();
  const { data: categories, error: categoryError } = await supabase.from("categories").select("id,code");
  if (categoryError) throw categoryError;
  const categoryByCode = new Map(categories.map((row) => [row.code, row.id]));
  const applied = [];

  for (const decision of DECISIONS) {
    const { data: current, error: readError } = await supabase.from("posters").select("id,title,field_verification").eq("id", decision.id).eq("poster_status", "review").maybeSingle();
    if (readError) throw readError;
    if (!current) continue;
    const reviewedAt = new Date().toISOString();
    const fieldVerification = {
      ...(current.field_verification ?? {}),
      decision: "approved",
      reason: decision.reason,
      dateIssues: [],
      duplicateIssues: [],
      classificationIssues: [],
      qualityIssues: [],
      aiQueueReview: {
        reviewer: "codex",
        reviewedAt,
        todayKst: "2026-09-22",
        finalStatus: decision.status,
        finalDeadlineType: decision.deadlineType,
        finalApplicationStartAt: decision.appStart ?? null,
        finalApplicationEndAt: decision.appEnd ?? null,
        finalEventStartAt: decision.eventStart ?? null,
        finalEventEndAt: decision.eventEnd ?? null,
        finalCategoryCodes: decision.categories,
        reason: decision.reason,
      },
    };
    const update = {
      poster_status: decision.status,
      published_at: decision.status === "published" ? reviewedAt : null,
      rejection_reason: null,
      application_start_at: toStart(decision.appStart),
      application_end_at: toEnd(decision.appEnd),
      event_start_at: toStart(decision.eventStart),
      event_end_at: toEnd(decision.eventEnd),
      deadline_type: decision.deadlineType,
      field_verification: fieldVerification,
    };
    if (decision.title) update.title = decision.title;
    const { error: updateError } = await supabase.from("posters").update(update).eq("id", decision.id).eq("poster_status", "review");
    if (updateError) throw updateError;
    const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", decision.id);
    if (deleteError) throw deleteError;
    const categoryRows = decision.categories.map((code) => ({ poster_id: decision.id, category_id: categoryByCode.get(code) })).filter((row) => row.category_id);
    const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
    if (insertError) throw insertError;
    applied.push({ id: decision.id, title: decision.title ?? current.title, status: decision.status });
  }
  console.log(JSON.stringify({ expected: DECISIONS.length, applied: applied.length, items: applied }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
