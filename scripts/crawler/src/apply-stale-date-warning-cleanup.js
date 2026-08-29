#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { evaluatePosterDateQuality, normalizeDateOnly } from "./poster-date-quality.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "stale-date-warning-cleanup.json");
const PAGE_SIZE = 500;
const UPDATE_BATCH_SIZE = 100;
const EXTRACTOR = "stale-date-warning-cleanup-v1";

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-stale-date-warning-cleanup" } },
  });
}

function dateKey(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return normalizeDateOnly(text);
  return new Date(parsed.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dateCandidatesFromVerification(verification = {}) {
  return [
    verification.correctedDeadline,
    verification?.dateQuality?.suggestedDeadline,
    verification?.dateQuality?.normalizedDeadline,
    verification?.dateQuality?.extractedDeadline,
    verification?.dateQuality?.storedDeadline,
  ].map(dateKey).filter(Boolean);
}

function hasDateWarning(verification = {}) {
  return (
    verification.deadlineMatches === false ||
    asArray(verification.dateIssues).length > 0 ||
    asArray(verification?.dateQuality?.issues).length > 0 ||
    verification?.dateQuality?.decision === "review"
  );
}

function hasActionableAuditIssue(dateQuality) {
  const actionable = new Set([
    "deadline-mismatch",
    "missing-clear-deadline",
    "date-end-before-start",
    "invalid-extracted-deadline",
  ]);
  return asArray(dateQuality.issues).some((issue) => actionable.has(issue?.code));
}

function buildCleanup(row) {
  const storedDeadline = dateKey(row.application_end_at);
  if (!storedDeadline) return null;

  const verification = row.field_verification && typeof row.field_verification === "object"
    ? row.field_verification
    : {};
  const dateQuality = evaluatePosterDateQuality(row, { extractedDeadline: storedDeadline });
  if (!hasDateWarning(verification)) return null;
  if (!dateCandidatesFromVerification(verification).includes(storedDeadline)) return null;
  if (hasActionableAuditIssue(dateQuality)) return null;

  const nextVerification = {
    ...verification,
    deadlineMatches: true,
    correctedDeadline: null,
    dateIssues: [],
    dateQuality: {
      ...(verification.dateQuality && typeof verification.dateQuality === "object" ? verification.dateQuality : {}),
      decision: "pass",
      storedDeadline,
      extractedDeadline: storedDeadline,
      normalizedDeadline: storedDeadline,
      suggestedDeadline: storedDeadline,
      issues: [],
      updatedBy: EXTRACTOR,
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    id: row.id,
    title: row.title,
    status: row.poster_status,
    application_end_at: storedDeadline,
    old_deadline_matches: verification.deadlineMatches ?? null,
    old_date_issues: asArray(verification.dateIssues).map((issue) => issue.code).filter(Boolean),
    audit_issue_codes: asArray(dateQuality.issues).map((issue) => issue.code).filter(Boolean),
    nextVerification,
  };
}

async function fetchRows(supabase, statuses, limit) {
  const rows = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, limit - 1);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,organizer_name,poster_status,source_key,summary_short,summary_long,application_end_at,field_verification,updated_at")
      .in("poster_status", statuses)
      .not("field_verification", "is", null)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function applyCleanups(supabase, cleanups) {
  let updated = 0;
  for (const batch of chunk(cleanups, UPDATE_BATCH_SIZE)) {
    await Promise.all(batch.map(async (cleanup) => {
      const { error } = await supabase
        .from("posters")
        .update({ field_verification: cleanup.nextVerification })
        .eq("id", cleanup.id);
      if (error) throw error;
      updated += 1;
    }));
  }
  return { updated };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const statuses = String(args.statuses ?? "published,review")
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
  const limit = Number(args.limit ?? "5000");

  const supabase = createSupabase();
  const rows = await fetchRows(supabase, statuses, limit);
  const cleanups = rows.map(buildCleanup).filter(Boolean);
  const result = apply ? await applyCleanups(supabase, cleanups) : { updated: 0 };
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    scanned_count: rows.length,
    cleanup_count: cleanups.length,
    result,
    cleanups: cleanups.map(({ nextVerification, ...cleanup }) => cleanup),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`mode=${report.mode}`);
  console.log(`scanned=${report.scanned_count}`);
  console.log(`cleanup_count=${report.cleanup_count}`);
  console.log(`updated=${report.result.updated}`);
  console.log(`report=${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
