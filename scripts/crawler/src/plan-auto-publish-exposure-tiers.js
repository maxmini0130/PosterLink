#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT = "data/eval/reports/auto-publish-plan-dryrun.json";
const DEFAULT_LIMIT = 5000;
const DEFAULT_TIERS = "A";
const MIN_AUTO_PUBLISH_CONTENT_TYPE_CONFIDENCE = 0.8;
const VALID_TIERS = new Set(["A", "B", "C"]);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/plan-auto-publish-exposure-tiers.js [--limit=5000] [--tiers=A] [--output=data/eval/reports/auto-publish-plan-dryrun.json] [--apply]

Plans Phase 3 auto-publish candidates from posters already assigned an exposure_tier.
Dry-run is the default. Applying requires both --apply and EXPOSURE_AUTO_PUBLISH=true.
Default tiers are A only for the launch safety window.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-auto-publish-plan" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseTiers(value) {
  const tiers = String(value || process.env.AUTO_PUBLISH_TIERS || DEFAULT_TIERS)
    .split(",")
    .map((tier) => tier.trim().toUpperCase())
    .filter(Boolean);
  const invalid = tiers.filter((tier) => !VALID_TIERS.has(tier));
  if (invalid.length > 0) {
    throw new Error(`Invalid exposure tiers: ${invalid.join(", ")}`);
  }
  return [...new Set(tiers)];
}

async function fetchReviewPosters(supabase, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,exposure_tier,tier_reason,tier_computed_at,created_at,source_org_name,application_end_at,deadline_type")
      .eq("poster_status", "review")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function fetchContentTypeEvidence(supabase, posterIds) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("poster_field_evidence")
      .select("poster_id,value_text,value_json,confidence,extractor")
      .eq("field_key", "content_type")
      .in("poster_id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function contentTypeValue(row) {
  return String(row?.value_json?.type ?? row?.value_json?.value ?? row?.value_text ?? "")
    .trim()
    .toLowerCase();
}

function bestContentTypeByPoster(rows) {
  const byPoster = new Map();
  for (const row of rows) {
    const confidence = Number(row.confidence);
    if (!Number.isFinite(confidence) || confidence <= 0) continue;
    const existing = byPoster.get(row.poster_id);
    if (!existing || confidence > existing.confidence) {
      byPoster.set(row.poster_id, {
        value: contentTypeValue(row),
        confidence,
        extractor: row.extractor ?? null,
      });
    }
  }
  return byPoster;
}

function isTierFresh(row) {
  return Boolean(row.tier_computed_at);
}

function kstDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function isFixedDeadlineActive(row) {
  if (String(row.deadline_type ?? "").toLowerCase() !== "fixed") return false;
  const deadlineKey = kstDateKey(row.application_end_at);
  const todayKey = kstDateKey();
  return Boolean(deadlineKey && todayKey && deadlineKey >= todayKey);
}

function buildPlans(rows, allowedTiers, contentTypeByPoster) {
  return rows.map((row) => {
    const reasons = [];
    const tier = String(row.exposure_tier ?? "").toUpperCase();
    const contentType = contentTypeByPoster.get(row.id) ?? null;
    if (!tier) reasons.push("missing_exposure_tier");
    if (tier && !allowedTiers.includes(tier)) reasons.push("tier_not_allowed");
    if (!isTierFresh(row)) reasons.push("missing_tier_computed_at");
    if (String(row.deadline_type ?? "").toLowerCase() !== "fixed") reasons.push("deadline_type_not_fixed");
    if (!row.application_end_at) reasons.push("missing_application_end_at");
    if (row.application_end_at && !isFixedDeadlineActive(row)) reasons.push("application_deadline_expired");
    if (!contentType) reasons.push("missing_content_type_evidence");
    if (contentType && contentType.value !== "recruit") reasons.push(`content_type_${contentType.value || "unknown"}`);
    if (
      contentType
      && contentType.value === "recruit"
      && contentType.confidence < MIN_AUTO_PUBLISH_CONTENT_TYPE_CONFIDENCE
    ) {
      reasons.push("low_confidence_content_type");
    }

    return {
      poster_id: row.id,
      title: row.title,
      source_org_name: row.source_org_name,
      poster_status: row.poster_status,
      exposure_tier: row.exposure_tier,
      tier_computed_at: row.tier_computed_at,
      application_end_at: row.application_end_at,
      deadline_type: row.deadline_type,
      content_type: contentType,
      eligible: reasons.length === 0,
      blocked_reasons: reasons,
      tier_reason: row.tier_reason,
    };
  });
}

function summarize(plans) {
  const byTier = {};
  const blockedReasons = {};
  for (const plan of plans) {
    const tier = plan.exposure_tier ?? "null";
    byTier[tier] = (byTier[tier] ?? 0) + 1;
    for (const reason of plan.blocked_reasons) {
      blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1;
    }
  }
  return {
    eligible_count: plans.filter((plan) => plan.eligible).length,
    blocked_count: plans.filter((plan) => !plan.eligible).length,
    by_tier: byTier,
    blocked_reasons: blockedReasons,
  };
}

async function applyPlans(supabase, plans, allowedTiers) {
  const results = [];
  const now = new Date().toISOString();
  for (const plan of plans.filter((entry) => entry.eligible)) {
    const { data, error } = await supabase
      .from("posters")
      .update({ poster_status: "published", published_at: now })
      .eq("id", plan.poster_id)
      .eq("poster_status", "review")
      .in("exposure_tier", allowedTiers)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      results.push({
        poster_id: plan.poster_id,
        status: "failed",
        error: error?.message ?? "poster was not eligible at update time",
      });
      continue;
    }

    const { error: auditError } = await supabase.from("admin_actions").insert({
      actor_user_id: null,
      target_type: "poster",
      target_id: plan.poster_id,
      action_type: "approve",
      action_reason: "auto_publish_exposure_tier",
      metadata_json: {
        status: "published",
        exposure_tier: plan.exposure_tier,
        auto_publish_tiers: allowedTiers,
        generated_by: "plan-auto-publish-exposure-tiers-v1",
        tier_reason: plan.tier_reason,
      },
    });

    results.push({
      poster_id: plan.poster_id,
      status: auditError ? "audit_failed" : "applied",
      error: auditError?.message ?? null,
    });
  }
  return results;
}

async function main() {
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const allowedTiers = parseTiers(args.tiers);

  if (apply && process.env.EXPOSURE_AUTO_PUBLISH !== "true") {
    throw new Error("Refusing to apply: set EXPOSURE_AUTO_PUBLISH=true in addition to --apply");
  }

  const supabase = createSupabase();
  const reviewPosters = await fetchReviewPosters(supabase, limit);
  const contentTypeRows = await fetchContentTypeEvidence(supabase, reviewPosters.map((poster) => poster.id));
  const plans = buildPlans(reviewPosters, allowedTiers, bestContentTypeByPoster(contentTypeRows));
  const results = apply ? await applyPlans(supabase, plans, allowedTiers) : [];
  const summary = summarize(plans);

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    allowed_tiers: allowedTiers,
    checked_count: reviewPosters.length,
    ...summary,
    applied_count: results.filter((result) => result.status === "applied").length,
    failed_count: results.filter((result) => result.status === "failed").length,
    audit_failed_count: results.filter((result) => result.status === "audit_failed").length,
    plans,
    results,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    mode: report.mode,
    allowed_tiers: report.allowed_tiers,
    checked_count: report.checked_count,
    eligible_count: report.eligible_count,
    blocked_count: report.blocked_count,
    by_tier: report.by_tier,
    blocked_reasons: report.blocked_reasons,
    applied_count: report.applied_count,
    failed_count: report.failed_count,
    audit_failed_count: report.audit_failed_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
