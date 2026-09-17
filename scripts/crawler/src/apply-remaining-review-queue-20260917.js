#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REMAINING_REVIEW_QUEUE_20260917";
const DECISIONS = [
  { id: "7cc310be-b32a-485e-b406-042ab631dbaa", status: "published", appEnd: "2026-10-27", eventStart: "2026-10-02", eventEnd: "2026-10-30", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "Each program closes three days before its start; the final 10/30 program closes on 10/27." },
  { id: "365b6929-75d9-4484-b73a-981359068bfa", status: "published", appStart: "2026-09-15", appEnd: "2026-09-20", eventStart: "2026-09-22", eventEnd: "2026-09-29", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_FAMILY"], reason: "The stated weekdays match 2026 exactly; the previously stored 2023 year was incorrect." },
  { id: "6273f06a-aa96-418b-86b7-283b3840c41f", status: "published", appEnd: "2026-09-22", eventStart: "2026-09-22", eventEnd: "2026-09-22", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "The official notice gives a 2026-09-22 running workshop and an active application link; event day is used as the user-facing deadline." },
  { id: "901559b2-b6e4-4450-9c88-df9be5de15c2", status: "published", deadlineType: "until_exhausted", categories: ["CAT_COURSE"], reason: "Valid one-to-one career consulting recruitment for 30 first-come participants; no fixed closing date is stated." },
  { id: "89c3a797-2979-4df4-9132-4c2be3d2f53c", status: "published", eventStart: "2026-12-02", eventEnd: "2026-12-20", deadlineType: "unknown", categories: ["CAT_COURSE"], reason: "Poster OCR verifies the Figma course period, but no separate application deadline is grounded." },
  { id: "12b90b06-8710-4251-a052-8f816d3e94d9", status: "published", appEnd: "2026-11-10", eventStart: "2026-11-11", eventEnd: "2026-11-14", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "Poster OCR verifies the 11/10 application deadline and 11/11-11/14 Tableau course period." },
  { id: "af94feb8-5c12-4b32-82c2-0d89d753fe58", status: "published", eventStart: "2026-10-21", eventEnd: "2026-12-20", deadlineType: "unknown", categories: ["CAT_SUPPORT_PROGRAM", "CAT_COURSE"], reason: "Valid paid work-experience project with active application links; the source states the program period but not a fixed application deadline." },
  { id: "6b24175a-07d7-40da-aad6-819be7ea8c1e", status: "published", appEnd: "2026-09-29", eventStart: "2026-10-03", eventEnd: "2026-11-28", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "All listed weekdays align with 2026; the previously stored 2023 year was incorrect." },
  { id: "d09089d2-8561-4c3c-8cdc-1397f889bb14", status: "closed", eventStart: "2025-10-03", eventEnd: "2025-10-09", deadlineType: "fixed", categories: ["CAT_LIFE_INFO"], reason: "This is a past 2025 Chuseok waste-disposal notice, so it is retained only as closed information." },
  { id: "0973637a-73ce-4d79-a1ba-639e7f0967af", status: "published", appStart: "2026-09-21", eventStart: "2026-10-03", eventEnd: "2026-10-05", deadlineType: "until_exhausted", categories: ["CAT_EVENT_RECRUIT", "CAT_FAMILY"], reason: "Application opens on 9/21 without a fixed end; the 10/3-10/5 family farm experience dates are explicit." },
  { id: "23e5fc41-c809-4e81-a969-f4465fde2f1f", status: "published", appStart: "2026-09-14", appEnd: "2026-09-28", eventStart: "2026-09-29", eventEnd: "2026-09-29", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "Official K-Startup text verifies the application window and class date; education is the representative category." },
  { id: "2217cc10-9f3c-4c26-86c5-68d92132e933", status: "published", appEnd: "2026-09-20", eventStart: "2026-09-20", eventEnd: "2026-09-20", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "Official youth-network post verifies the public festival on 2026-09-20." },
  { id: "e8cb38e6-6dd5-4e2d-b2f3-768ce9925331", status: "published", eventStart: "2026-10-08", eventEnd: "2026-10-08", deadlineType: "until_exhausted", categories: ["CAT_FAMILY", "CAT_HEALTH"], reason: "The official page was posted on 2026-09-14 and poster OCR verifies the 10/8 class; registration is first-come without a fixed deadline." },
  { id: "3b411b41-c9ee-44c4-a51d-758982262faf", status: "published", appEnd: "2026-10-22", eventStart: "2026-10-01", eventEnd: "2026-10-22", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "The source verifies four weekly reading and discussion sessions through 10/22 with an active application form." },
  { id: "6cb922b9-0ac6-4047-9242-06514bbf2896", status: "published", appEnd: "2026-09-18", eventStart: "2026-09-18", eventEnd: "2026-09-18", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "Official Mapo notice and matching poster verify the public concert date and location." },
  { id: "b8c3f4ab-86ad-492e-a149-f854b7552b62", status: "published", appStart: "2026-09-10", appEnd: "2026-10-31", eventStart: "2026-10-01", eventEnd: "2026-10-31", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "Canonical Mapo-gu notice for the education-month program; title and poster verify registration starting 9/10 and the October program period." },
  { id: "81f7414a-3290-4a96-b686-27c3e1e548c8", status: "rejected", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "Duplicate republication of the canonical Mapo-gu education-month notice b8c3f4ab-86ad-492e-a149-f854b7552b62." },
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
      classificationIssues: [],
      qualityIssues: [],
      aiQueueReview: {
        reviewer: "codex",
        reviewedAt,
        todayKst: "2026-09-17",
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
      published_at: decision.status === "rejected" ? null : reviewedAt,
      rejection_reason: decision.status === "rejected" ? decision.reason : null,
      application_start_at: toStart(decision.appStart),
      application_end_at: toEnd(decision.appEnd),
      event_start_at: toStart(decision.eventStart),
      event_end_at: toEnd(decision.eventEnd),
      deadline_type: decision.deadlineType,
      field_verification: fieldVerification,
    };
    const { error: updateError } = await supabase.from("posters").update(update).eq("id", decision.id).eq("poster_status", "review");
    if (updateError) throw updateError;
    const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", decision.id);
    if (deleteError) throw deleteError;
    const categoryRows = decision.categories.map((code) => ({ poster_id: decision.id, category_id: categoryByCode.get(code) })).filter((row) => row.category_id);
    const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
    if (insertError) throw insertError;
    applied.push({ id: decision.id, title: current.title, status: decision.status });
  }
  console.log(JSON.stringify({ expected: DECISIONS.length, applied: applied.length, items: applied }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
