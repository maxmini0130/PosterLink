#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REMAINING_REVIEW_QUEUE_20260920";
const DECISIONS = [
  { id: "ba0a1a13-deee-4c4a-bdef-b15ab3c82a99", appStart: "2026-09-16", appEnd: "2026-10-16", deadlineType: "fixed", categories: ["CAT_FAMILY", "CAT_SUPPORT_PROGRAM"], reason: "The stated Wednesday 9/16 and Friday 10/16 align with 2026, not the stored 2023 year; the benefit is a family meal-kit support program." },
  { id: "80793a03-0eef-48a4-abf7-b3bf2414b4f5", appEnd: "2026-10-25", eventStart: "2026-10-08", eventEnd: "2026-10-28", deadlineType: "fixed", categories: ["CAT_COURSE"], reason: "All event weekdays align with October 2026; the final 10/28 program closes three days before its start on 10/25." },
  { id: "5c47b5bd-f0f4-4d89-9393-341961e0c8a2", appEnd: "2026-09-21", eventStart: "2026-09-23", eventEnd: "2026-09-23", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT"], reason: "The Monday 9/21 deadline and Wednesday 9/23 event align with 2026; the stored 2023 year was incorrect." },
  { id: "aeb0ee85-0329-4b0a-ab0b-d656db0baf7c", appEnd: "2026-09-22", eventStart: "2026-09-28", eventEnd: "2026-09-28", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_BUSINESS"], reason: "The title verifies the 9/22 application deadline, while the body separately verifies the 9/28 lecture and networking event." },
  { id: "6c53d8d2-ee69-4e29-9e93-6b900dc3f7be", eventStart: "2026-10-24", eventEnd: "2026-10-24", deadlineType: "until_exhausted", categories: ["CAT_FAMILY", "CAT_COURSE"], reason: "The official notice verifies a 10/24 class for 12 couples and explicitly states first-come registration without a fixed deadline." },
  { id: "139b08c7-c139-444c-98d8-5609c3b3cc50", appEnd: "2026-09-28", eventStart: "2026-10-01", eventEnd: "2026-11-30", deadlineType: "fixed", categories: ["CAT_EVENT_RECRUIT", "CAT_COURSE"], reason: "The Monday 9/28 deadline and all listed Thursday sessions align with 2026; the stored 2023 year was incorrect." },
  { id: "3c4d5481-d2ed-4f93-9c21-f5cf751dc3e2", eventStart: "2026-06-11", eventEnd: "2026-12-10", deadlineType: "ongoing", categories: ["CAT_EVENT_RECRUIT"], reason: "The source explicitly says ongoing recruitment and the Thursday schedule from 6/11 to 12/10 aligns with 2026." },
  { id: "81439d03-2b6a-4697-990d-cc51e012d8d1", appEnd: "2026-10-02", eventStart: "2026-10-06", eventEnd: "2026-10-08", deadlineType: "fixed", categories: ["CAT_COURSE", "CAT_EVENT_RECRUIT"], reason: "The Friday 10/2 deadline and Tuesday/Thursday sessions align with 2026, corroborated by poster OCR; the stored 2023 year was incorrect." },
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
      classificationIssues: [],
      qualityIssues: [],
      aiQueueReview: {
        reviewer: "codex",
        reviewedAt,
        todayKst: "2026-09-20",
        finalStatus: "published",
        finalDeadlineType: decision.deadlineType,
        finalApplicationStartAt: decision.appStart ?? null,
        finalApplicationEndAt: decision.appEnd ?? null,
        finalEventStartAt: decision.eventStart ?? null,
        finalEventEndAt: decision.eventEnd ?? null,
        finalCategoryCodes: decision.categories,
        reason: decision.reason,
      },
    };
    const { error: updateError } = await supabase.from("posters").update({
      poster_status: "published",
      published_at: reviewedAt,
      rejection_reason: null,
      application_start_at: toStart(decision.appStart),
      application_end_at: toEnd(decision.appEnd),
      event_start_at: toStart(decision.eventStart),
      event_end_at: toEnd(decision.eventEnd),
      deadline_type: decision.deadlineType,
      field_verification: fieldVerification,
    }).eq("id", decision.id).eq("poster_status", "review");
    if (updateError) throw updateError;
    const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", decision.id);
    if (deleteError) throw deleteError;
    const categoryRows = decision.categories.map((code) => ({ poster_id: decision.id, category_id: categoryByCode.get(code) })).filter((row) => row.category_id);
    const { error: insertError } = await supabase.from("poster_categories").insert(categoryRows);
    if (insertError) throw insertError;
    applied.push({ id: decision.id, title: current.title });
  }
  console.log(JSON.stringify({ expected: DECISIONS.length, applied: applied.length, items: applied }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
