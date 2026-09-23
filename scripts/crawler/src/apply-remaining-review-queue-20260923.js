#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REMAINING_REVIEW_QUEUE_20260923";
const DECISIONS = [
  {
    id: "ffb18437-f408-439d-b1f8-76d0e5e092bd",
    appEnd: "2026-10-16",
    eventStart: "2026-10-16",
    eventEnd: "2026-10-16",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_FAMILY"],
    reason: "The official notice gives a free outdoor family movie screening on Friday, October 16, 2026 with first-come Naver Form registration; no earlier deadline is stated.",
  },
  {
    id: "234c72d2-5d8d-428e-85d2-e2af2e6a8d8d",
    appStart: "2026-09-10",
    appEnd: "2026-09-30",
    eventStart: "2026-10-01",
    eventEnd: "2026-10-01",
    deadlineType: "fixed",
    categories: ["CAT_COURSE"],
    reason: "The Wednesday September 30 deadline and Thursday October 1 lecture align with 2026, not the stored 2023 year; this is a structured science-career lecture.",
  },
  {
    id: "f65fe0c2-b1af-41ab-af4a-a57c6df80fdd",
    appStart: "2026-09-28",
    eventStart: "2026-10-09",
    eventEnd: "2026-10-10",
    deadlineType: "until_exhausted",
    categories: ["CAT_EVENT_RECRUIT"],
    reason: "This October 9-10 sweet-potato farm experience is distinct from the existing September peanut event; registration opens September 28 and has no stated fixed end date.",
  },
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
        todayKst: "2026-09-23",
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
