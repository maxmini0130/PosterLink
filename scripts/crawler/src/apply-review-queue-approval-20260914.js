#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRM_TOKEN = "APPLY_REVIEW_QUEUE_APPROVAL_20260914";
const REPORT_DEFAULT = "data/results/review-queue-approval-20260914.json";
const REVIEWER = "codex-review-queue-20260914";

const DECISIONS = [
  {
    id: "d73dcbbe-a684-4952-9274-9a037ed37df1",
    status: "closed",
    appEnd: "2026-09-12",
    eventStart: "2026-09-12",
    eventEnd: "2026-09-12",
    deadlineType: "fixed",
    categories: ["CAT_EVENT_RECRUIT", "CAT_CULTURE"],
    reason: "Open Dongdaemun book festival was held on 2026-09-12 12:00-17:00; it is a real cultural event but already passed as of 2026-09-14.",
  },
  {
    id: "c4c9794d-7bd5-4251-8969-f051e20aa6c5",
    status: "published",
    appStart: "2026-08-31",
    appEnd: null,
    eventStart: "2026-09-19",
    eventEnd: "2026-09-19",
    deadlineType: "until_exhausted",
    categories: ["CAT_EVENT_RECRUIT", "CAT_LIFE_INFO"],
    reason: "Gangseo youth-center keyring workshop states applications run from 2026-08-31 until capacity fills; event is 2026-09-19.",
    links: [
      ["official_apply", "담당기관 바로가기", "https://forms.gle/FBHa57JL1G3PiQRZ9", true],
      ["official_notice", "공식 공고 원문", "https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=73453", false],
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
    global: { headers: { "X-Client-Info": "posterlink-review-approval-20260914" } },
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
  verification.decision = decision.status === "closed" ? "closed" : "approved";
  verification.reason = `AI direct queue review ${decision.status}: ${decision.reason}`;
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
      published_at: decision.status === "published" ? new Date().toISOString() : null,
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
      action_reason: "review_queue_approval_20260914",
      metadata_json: {
        reviewed_by: "codex",
        approved_or_closed_count: applied.length,
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
