#!/usr/bin/env node
import "./load-env.js";

import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "RESTORE_REVIEW_QUEUE_EXCLUSIONS_20260917";
const RESTORES = [
  {
    id: "af94feb8-5c12-4b32-82c2-0d89d753fe58",
    applicationEndAt: "2026-12-20T23:59:59+09:00",
    categoryCode: "CAT_WELFARE",
    reason: "Application deadline is not verified from the source evidence.",
  },
  {
    id: "23e5fc41-c809-4e81-a969-f4465fde2f1f",
    applicationEndAt: "2026-09-28T23:59:59+09:00",
    categoryCode: "CAT_BUSINESS",
    reason: "Representative category requires manual correction to education/course.",
  },
];

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service key are required");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  if (!process.argv.includes(`--confirm=${CONFIRM_TOKEN}`)) {
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  }
  const supabase = createSupabase();
  const { data: categories, error: categoryError } = await supabase.from("categories").select("id,code");
  if (categoryError) throw categoryError;
  const categoryByCode = new Map(categories.map((row) => [row.code, row.id]));

  for (const restore of RESTORES) {
    const { data: row, error: readError } = await supabase
      .from("posters")
      .select("id,field_verification")
      .eq("id", restore.id)
      .single();
    if (readError) throw readError;
    const fieldVerification = {
      ...(row.field_verification ?? {}),
      decision: "review",
      reason: restore.reason,
      aiQueueReviewCorrection: {
        correctedAt: new Date().toISOString(),
        correctedBy: "codex",
        reason: restore.reason,
      },
    };
    const { error: updateError } = await supabase.from("posters").update({
      poster_status: "review",
      published_at: null,
      application_start_at: null,
      application_end_at: restore.applicationEndAt,
      event_start_at: null,
      event_end_at: null,
      deadline_type: "fixed",
      field_verification: fieldVerification,
    }).eq("id", restore.id);
    if (updateError) throw updateError;

    const { error: deleteError } = await supabase.from("poster_categories").delete().eq("poster_id", restore.id);
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabase.from("poster_categories").insert({
      poster_id: restore.id,
      category_id: categoryByCode.get(restore.categoryCode),
    });
    if (insertError) throw insertError;
  }
  console.log(JSON.stringify({ restored_to_review: RESTORES.map((item) => item.id) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
