#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { buildContentTypeEvidence } from "./content-type-routing.js";

const DEFAULT_OUTPUT = "data/results/content-type-evidence-dryrun.json";
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
  node src/backfill-content-type-evidence.js [--limit=5000] [--statuses=published,review,rejected] [--output=data/results/content-type-evidence-dryrun.json] [--apply]

Builds poster_field_evidence.content_type rows for Phase 5 feed routing.
Dry-run is the default. --apply upserts only poster_field_evidence rows; it
does not change poster_status or exposure_tier.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-content-type-backfill" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchPosters(supabase, statuses, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,poster_status,summary_short,summary_long,source_org_name,source_key,field_verification,created_at")
      .in("poster_status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function applyEvidenceRows(supabase, rows) {
  const results = [];
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase
      .from("poster_field_evidence")
      .upsert(chunk, { onConflict: "poster_id,field_key,extractor" });
    if (!error) {
      results.push({
        index,
        count: chunk.length,
        status: "applied",
        error: null,
      });
      continue;
    }

    console.error(`[content-type] chunk upsert failed at ${index}: ${error.message}`);
    for (let rowIndex = 0; rowIndex < chunk.length; rowIndex += 1) {
      const row = chunk[rowIndex];
      const retry = await supabase
        .from("poster_field_evidence")
        .upsert(row, { onConflict: "poster_id,field_key,extractor" });
      results.push({
        index: index + rowIndex,
        count: 1,
        poster_id: row.poster_id,
        status: retry.error ? "failed" : "applied",
        error: retry.error?.message ?? null,
      });
      if (retry.error) {
        console.error(`[content-type] row upsert failed ${row.poster_id}: ${retry.error.message}`);
      }
    }
  }
  return results;
}

function summarize(plans) {
  const contentTypes = {};
  const reasons = {};
  for (const plan of plans) {
    const type = plan.evidence?.value_text ?? "none";
    const reason = plan.evidence?.value_json?.reason ?? "none";
    contentTypes[type] = (contentTypes[type] ?? 0) + 1;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return { contentTypes, reasons };
}

async function main() {
  const supabase = createSupabase();
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const statuses = String(args.statuses || "published,review,rejected")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);

  const posters = await fetchPosters(supabase, statuses, limit);
  const plans = posters.map((poster) => ({
    id: poster.id,
    title: poster.title,
    poster_status: poster.poster_status,
    evidence: buildContentTypeEvidence(poster),
  }));
  const evidenceRows = plans.map((plan) => plan.evidence).filter(Boolean);
  const results = apply ? await applyEvidenceRows(supabase, evidenceRows) : [];
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
    content_types: report.contentTypes,
    top_reasons: Object.fromEntries(
      Object.entries(report.reasons)
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
