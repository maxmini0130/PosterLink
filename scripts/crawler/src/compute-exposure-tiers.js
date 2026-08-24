#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { bestFieldsFromEvidence, computeTier } from "./exposure-tier.js";

const DEFAULT_OUTPUT = "data/eval/reports/exposure-tier-dryrun.json";
const DEFAULT_LIMIT = 5000;
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
  node src/compute-exposure-tiers.js [--limit=5000] [--statuses=published,review] [--output=data/eval/reports/exposure-tier-dryrun.json] [--apply]

Computes Phase 3 A/B/C exposure tiers from poster_field_evidence.
Dry-run is the default. --apply updates posters.exposure_tier,
tier_computed_at, and tier_reason. This script never changes poster_status and
does not auto-publish posters.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-exposure-tier-compute" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasDuplicateIssues(row) {
  return asArray(row.field_verification?.duplicateIssues)
    .some((issue) => issue?.duplicatePosterId || String(issue?.code ?? "").includes("duplicate"));
}

function inferContentType(row) {
  const route = String(
    row.field_verification?.classification?.route ??
    row.field_verification?.classification?.contentType ??
    "",
  ).toLowerCase();
  if (["recruit", "news", "admin", "discard"].includes(route)) return route;
  if (row.poster_status === "rejected") return "discard";
  return "recruit";
}

async function fetchPosters(supabase, statuses, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,thumbnail_url,field_verification,created_at")
      .in("poster_status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function fetchEvidence(supabase, posterIds) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("poster_field_evidence")
        .select("poster_id,field_key,value_text,value_json,confidence,evidence_text,evidence_src,extractor")
        .in("poster_id", chunk)
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

function summarize(plans) {
  const tiers = { A: 0, B: 0, C: 0 };
  const gates = { seo: 0, calendar: 0, deadlineAlert: 0, recommendation: 0 };
  const reasonCounts = {};
  for (const plan of plans) {
    tiers[plan.tier] = (tiers[plan.tier] ?? 0) + 1;
    for (const [gate, enabled] of Object.entries(plan.gates)) {
      if (enabled) gates[gate] = (gates[gate] ?? 0) + 1;
    }
    for (const reason of plan.reason) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
  }
  return { tiers, gates, reasonCounts };
}

async function applyPlans(supabase, plans) {
  const results = [];
  const computedAt = new Date().toISOString();
  for (let index = 0; index < plans.length; index += 200) {
    const chunk = plans.slice(index, index + 200);
    const payload = chunk.map((plan) => ({
      id: plan.poster_id,
      exposure_tier: plan.tier,
      tier_computed_at: computedAt,
      tier_reason: {
        reason: plan.reason,
        gates: plan.gates,
        field_count: plan.field_count,
        generated_by: "compute-exposure-tiers-v1",
      },
    }));
    const { error } = await supabase
      .from("posters")
      .upsert(payload, { onConflict: "id" });
    results.push({
      index,
      count: chunk.length,
      status: error ? "failed" : "applied",
      error: error?.message ?? null,
    });
    if (error) console.error(`[exposure-tier] upsert failed: ${error.message}`);
  }
  return results;
}

async function main() {
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const statuses = String(args.statuses || "published,review")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const supabase = createSupabase();
  const posters = await fetchPosters(supabase, statuses, limit);
  const evidenceRows = await fetchEvidence(supabase, posters.map((poster) => poster.id));
  const evidenceByPoster = new Map();

  for (const row of evidenceRows) {
    const list = evidenceByPoster.get(row.poster_id) ?? [];
    list.push(row);
    evidenceByPoster.set(row.poster_id, list);
  }

  const plans = posters.map((poster) => {
    const evidence = evidenceByPoster.get(poster.id) ?? [];
    const result = computeTier({
      fields: bestFieldsFromEvidence(evidence),
      isDuplicate: hasDuplicateIssues(poster),
      contentType: inferContentType(poster),
      hasPosterImage: Boolean(poster.thumbnail_url),
    });
    return {
      poster_id: poster.id,
      title: poster.title,
      poster_status: poster.poster_status,
      field_count: evidence.length,
      tier: result.tier,
      reason: result.reason,
      gates: result.gates,
    };
  });

  const results = apply ? await applyPlans(supabase, plans) : [];
  const summary = summarize(plans);
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    checked_count: posters.length,
    evidence_row_count: evidenceRows.length,
    ...summary,
    applied_count: results
      .filter((result) => result.status === "applied")
      .reduce((sum, result) => sum + result.count, 0),
    failed_count: results.filter((result) => result.status === "failed").length,
    plans,
    results,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    mode: report.mode,
    checked_count: report.checked_count,
    evidence_row_count: report.evidence_row_count,
    tiers: report.tiers,
    gates: report.gates,
    top_reasons: Object.fromEntries(
      Object.entries(report.reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    ),
    applied_count: report.applied_count,
    failed_count: report.failed_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
