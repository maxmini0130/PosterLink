#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REMAINING_REVIEW_QUEUE_20260922";
const TODAY_KST = "2026-09-22";
const DECISIONS = [
  { id: "64bda35c-781a-4d72-af30-1d921d63eee0", status: "published", appStart: "2026-09-18", appEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_CONTEST", "CAT_SUPPORT_PROGRAM"], reason: "The official notice explicitly states the 2026-09-18 through 2026-10-08 application period; judging, awards, and startup support make contest the representative category." },
  { id: "b5952b77-5bf1-4b81-8eaa-52de88353f0a", status: "published", appStart: "2026-09-17", appEnd: "2026-10-05", eventStart: "2026-10-08", eventEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM"], reason: "The October notice is distinct from the older August candidate; its official application period ends 2026-10-05 and the selected teams receive an October 8 office-hour consultation." },
  { id: "a1ed9a5e-2006-4e62-8b0c-ca111647c321", status: "published", appStart: "2026-09-17", appEnd: "2026-09-29", deadlineType: "fixed", categories: ["CAT_SUPPORT_PROGRAM"], reason: "The full official notice verifies the 2026-09-17 through 2026-09-29 application period and direct investment, acceleration, and follow-on support." },
  { id: "73699343-c9e9-4752-a979-c80cfaf72322", status: "published", eventStart: "2026-09-16", eventEnd: "2026-11-25", deadlineType: "ongoing", categories: ["CAT_HEALTH"], reason: "The title states 2026, the Wednesday schedule aligns with the 2026 calendar, and the notice explicitly permits joining after the September 16 start; the primary benefit is mental-health care." },
  { id: "da587ea0-24e8-476b-b4f4-640b0d7d5969", status: "published", appEnd: "2026-10-15", eventStart: "2026-10-01", eventEnd: "2026-10-15", deadlineType: "until_exhausted", categories: ["CAT_SUPPORT_PROGRAM"], reason: "The notice offers reservable one-to-one housing consultations on October 1 and 15; the last session is retained instead of incorrectly treating the first session as the only deadline." },
  { id: "49c4ac3d-4654-44ca-8118-0327a0c20ff6", status: "published", appStart: "2026-09-21", appEnd: "2026-10-13", eventStart: "2026-10-23", eventEnd: "2026-10-23", deadlineType: "fixed", categories: ["CAT_HEALTH"], reason: "The Monday 9/21, Tuesday 10/13, and Friday 10/23 weekdays all align with 2026; this is a guided forest-healing program rather than a 2023 notice." },
  { id: "5c71aec9-6a25-447e-a93d-e88b070f5eb6", status: "published", eventStart: "2026-10-15", eventEnd: "2026-10-16", deadlineType: "until_exhausted", categories: ["CAT_COURSE"], reason: "The Thursday and Friday education dates align with October 15-16, 2026, and registration is available until the stated budget is exhausted." },
  { id: "9ec4c8f2-5fd3-4d28-a584-9a603b23393f", status: "published", appEnd: "2026-10-09", eventStart: "2026-10-16", eventEnd: "2026-11-20", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official notice verifies an October 9 deadline and a six-week Friday class from October 16 through November 20, 2026." },
  { id: "7aa5c828-e1c8-4fb0-83b7-9fb46164435f", status: "published", appEnd: "2026-09-30", eventStart: "2026-10-02", eventEnd: "2026-11-13", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The application deadline and all six Friday sessions are explicitly stated and align with the 2026 calendar." },
  { id: "b72ebf8a-89e0-4d04-915d-e3b318278fd8", status: "published", eventStart: "2026-10-13", eventEnd: "2026-12-15", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT"], reason: "The current 2026 listing recruits seven adults on a first-come basis for the October, November, and December book-club meetings; no fixed application deadline is stated." },
  { id: "950017a7-ed7d-4027-b0fe-78637363b1ce", status: "published", appStart: "2026-09-20", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT"], reason: "The official library listing explicitly opens registration on 2026-09-20 and states first-come closure without supplying a fixed end date." },
  { id: "69494d89-e6d0-4150-92be-6e03da0a7d9c", status: "published", eventStart: "2026-10-19", eventEnd: "2026-10-29", deadlineType: "until_exhausted", categories: ["CAT_COURSE"], reason: "The notice identifies the program as part of the 2026 youth growth project, gives four October 19-29 sessions, and states registration remains open until filled." },
  { id: "25fbe322-d1c4-4fc4-a96f-387ae56d5e78", status: "published", eventStart: "2026-10-16", eventEnd: "2026-10-23", deadlineType: "until_exhausted", categories: ["CAT_COURSE"], reason: "The two workshop dates are explicit; the application period is until filled, so an invented October 15 fixed deadline is removed." },
  { id: "314f47fe-d22b-4102-a58c-cea21a9f5419", status: "rejected", deadlineType: "fixed", categories: [], reason: "Duplicate rejection: the same Soma Day program, application form, October 2 deadline, and October 8/15 schedule are already published as poster df81662d-49a2-4cd1-8310-7c76b5f9dc8b." },
  { id: "59f1e0f5-cbfc-4476-86eb-4a03a4f4bbe5", status: "published", appEnd: "2026-10-07", eventStart: "2026-10-07", eventEnd: "2026-10-07", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official notice verifies the October 7, 2026 employment-preparation session and provides a participation form; the event date is the user-facing deadline because no earlier deadline is stated." },
  { id: "7f955659-70b6-4dd5-a438-36f7b02379b7", status: "published", appStart: "2026-09-14", appEnd: "2026-09-27", eventStart: "2026-10-19", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The official AI+ Academy notice explicitly gives a September 14-27, 2026 recruitment period and an October 19 opening; structured vocational training is the representative category." },
  { id: "e746c659-c6dd-4f89-9ce6-c935b855e331", status: "closed", title: "도자기 핸드페인팅 원데이클래스 모집", appEnd: "2026-09-13", eventStart: "2026-09-16", eventEnd: "2026-09-16", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The body and Seoul reservation ID describe pottery painting, not drip coffee; the Sunday 9/13 deadline and Wednesday 9/16 class align with 2026 and have already ended." },
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
      decision: decision.status === "rejected" ? "rejected" : "approved",
      reason: decision.reason,
      dateIssues: [],
      duplicateIssues: decision.status === "rejected" ? current.field_verification?.duplicateIssues ?? [] : [],
      classificationIssues: [],
      qualityIssues: [],
      aiQueueReview: {
        reviewer: "codex",
        reviewedAt,
        todayKst: TODAY_KST,
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
      rejection_reason: decision.status === "rejected" ? decision.reason : null,
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
    if (categoryRows.length) {
      const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
      if (insertError) throw insertError;
    }
    applied.push({ id: decision.id, title: decision.title ?? current.title, status: decision.status });
  }
  console.log(JSON.stringify({ expected: DECISIONS.length, applied: applied.length, items: applied }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
