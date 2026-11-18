#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { evaluatePosterQuality, summarizeQualityIssues } from "./poster-quality-gate.js";
import { hasSameCleanupHold, withReviewCleanupHold } from "./review-cleanup-hold.js";
import { planImageClear, withImageCleared } from "./review-image-clear.js";

const DEFAULT_OUTPUT = "data/results/review-nonposter-cleanup.json";
const DEFAULT_LIMIT = 1000;
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
  node src/cleanup-review-nonposters.js [--limit=1000] [--statuses=review] [--output=data/results/review-nonposter-cleanup.json] [--apply]

Re-evaluates crawler-created posters with the current quality gate.
When the only problem is a non-poster representative image (and it is the
poster's only image), the image is cleared, recorded in
field_verification.imageCleanup, and the notice continues as a text notice.
Other rows the gate would reject stay in review with the issues recorded and
a quality gate hold (no automatic approval). Only a person rejects a poster.
Without --apply, only writes a dry-run report.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }

  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function fetchReviewRows(supabase, limit, statuses) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,summary_short,summary_long,thumbnail_url,source_key,created_at,field_verification,exposure_tier,poster_images(id,storage_path,image_type,width,height)")
      .in("poster_status", statuses)
      .not("source_key", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function main() {
  const supabase = createSupabase();
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const apply = Boolean(args.apply);
  const statuses = String(args.statuses || "review")
    .split(/[,\s]+/)
    .map((status) => status.trim())
    .filter(Boolean);
  const rows = await fetchReviewRows(supabase, limit, statuses);

  const rejected = rows
    .map((row) => {
      const { poster_images: _images, ...base } = row;
      const quality = evaluatePosterQuality({
        ...base,
        images: row.thumbnail_url ? [row.thumbnail_url] : [],
      });
      return { row, base, quality };
    })
    .filter(({ quality }) => quality.decision === "reject")
    .map((entry) => {
      // The same notice without its image, as a text notice: is the text fine?
      const textQuality = evaluatePosterQuality({
        ...entry.base,
        thumbnail_url: null,
        images: [],
        contentMode: "text_notice",
      });
      return { ...entry, plan: planImageClear(entry.row, entry.quality, textQuality) };
    });

  const reportRows = rejected.map(({ row, quality }) => ({
    id: row.id,
    title: row.title,
    source_org_name: row.source_org_name,
    source_key: row.source_key,
    exposure_tier: row.exposure_tier ?? null,
    created_at: row.created_at,
    issues: quality.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      reason: issue.reason,
      evidence: issue.evidence,
    })),
    reason: summarizeQualityIssues(quality, 6),
  }));
  for (const [index, entry] of rejected.entries()) {
    reportRows[index].action = entry.plan.action === "clear" ? "clear_image" : "hold";
    reportRows[index].plan_reason = entry.plan.reason;
    if (entry.plan.action === "clear") reportRows[index].cleared_image_url = entry.plan.imageUrl;
  }

  // Clear only the image when it is the only problem (review-image-clear.js);
  // otherwise hold, never reject: a person decides (review-cleanup-hold.js).
  const toClear = rejected.filter(({ plan }) => plan.action === "clear");
  const toHold = rejected.filter(({ row, quality, plan }) => plan.action !== "clear" && !hasSameCleanupHold(row.field_verification, quality));
  let held = 0;
  let cleared = 0;
  if (apply) {
    const now = new Date().toISOString();
    const runId = process.env.GITHUB_RUN_ID ?? null;
    for (const { row, quality, plan } of toClear) {
      const removedPosterImages = Array.isArray(row.poster_images) ? row.poster_images : [];
      const { data, error } = await supabase
        .from("posters")
        .update({
          thumbnail_url: null,
          field_verification: withImageCleared(row.field_verification ?? {}, plan, { now, runId, removedPosterImages, quality }),
        })
        .eq("id", row.id)
        .eq("thumbnail_url", row.thumbnail_url)
        .in("poster_status", statuses)
        .select("id");
      if (error) throw error;
      if (!data?.length) continue;
      if (removedPosterImages.length > 0) {
        const { error: deleteError } = await supabase
          .from("poster_images")
          .delete()
          .eq("poster_id", row.id)
          .in("id", removedPosterImages.map((image) => image.id));
        // The record above lists these rows; a retry or a person can remove them.
        if (deleteError) throw new Error(`poster_images delete failed for ${row.id} after clearing thumbnail: ${deleteError.message}`);
      }
      cleared += 1;
    }
    for (const { row, quality } of toHold) {
      const { data, error } = await supabase
        .from("posters")
        .update({ field_verification: withReviewCleanupHold(row.field_verification ?? {}, quality, { now, runId }) })
        .eq("id", row.id)
        .in("poster_status", statuses)
        .select("id");
      if (error) throw error;
      held += data?.length ?? 0;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    scanned_count: rows.length,
    reject_count: rejected.length,
    clear_image_count: toClear.length,
    cleared_image_count: cleared,
    hold_count: toHold.length,
    held_count: held,
    rows: reportRows,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    output,
    mode: report.mode,
    scanned_count: report.scanned_count,
    reject_count: report.reject_count,
    clear_image_count: report.clear_image_count,
    cleared_image_count: report.cleared_image_count,
    hold_count: report.hold_count,
    held_count: report.held_count,
    sample: reportRows.slice(0, 10).map((row) => ({
      title: row.title,
      issues: row.issues.map((issue) => issue.code),
      action: row.action,
      plan_reason: row.plan_reason,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
