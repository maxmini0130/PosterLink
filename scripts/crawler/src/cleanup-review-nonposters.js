#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { evaluatePosterQuality, summarizeQualityIssues } from "./poster-quality-gate.js";

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

function mergeQualityIssues(fieldVerification = {}, quality) {
  const existingIssues = Array.isArray(fieldVerification.qualityIssues)
    ? fieldVerification.qualityIssues
    : [];
  const nextIssues = (quality.issues ?? []).map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    reason: issue.reason,
    evidence: issue.evidence,
    decision: issue.decision,
  }));
  const seen = new Set();
  const qualityIssues = [...existingIssues, ...nextIssues].filter((issue) => {
    const key = `${issue.code}:${issue.evidence ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ...fieldVerification,
    decision: "rejected",
    reason: [fieldVerification.reason, summarizeQualityIssues(quality)]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1000),
    qualityIssues,
    cleanup: {
      ...(fieldVerification.cleanup ?? {}),
      reviewNonposterCleanupAt: new Date().toISOString(),
    },
  };
}

async function fetchReviewRows(supabase, limit, statuses) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,summary_short,summary_long,thumbnail_url,source_key,created_at,field_verification")
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
      const quality = evaluatePosterQuality({
        ...row,
        images: row.thumbnail_url ? [row.thumbnail_url] : [],
      });
      return { row, quality };
    })
    .filter(({ quality }) => quality.decision === "reject");

  const reportRows = rejected.map(({ row, quality }) => ({
    id: row.id,
    title: row.title,
    source_org_name: row.source_org_name,
    source_key: row.source_key,
    created_at: row.created_at,
    issues: quality.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      reason: issue.reason,
      evidence: issue.evidence,
    })),
    reason: summarizeQualityIssues(quality, 6),
  }));

  if (apply) {
    for (const { row, quality } of rejected) {
      const { error } = await supabase
        .from("posters")
        .update({
          poster_status: "rejected",
          rejection_reason: `quality_gate_cleanup:${summarizeQualityIssues(quality, 6)}`.slice(0, 1000),
          field_verification: mergeQualityIssues(row.field_verification ?? {}, quality),
        })
        .eq("id", row.id)
        .in("poster_status", statuses);
      if (error) throw error;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    scanned_count: rows.length,
    reject_count: rejected.length,
    rows: reportRows,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    output,
    mode: report.mode,
    scanned_count: report.scanned_count,
    reject_count: report.reject_count,
    sample: reportRows.slice(0, 10).map((row) => ({
      title: row.title,
      issues: row.issues.map((issue) => issue.code),
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
