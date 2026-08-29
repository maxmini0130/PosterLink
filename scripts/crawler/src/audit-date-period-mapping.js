#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { evaluatePosterDateQuality, normalizeDateOnly } from "./poster-date-quality.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "eval", "reports", "date-period-mapping-audit.json");
const PAGE_SIZE = 500;

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
    global: { headers: { "X-Client-Info": "posterlink-date-period-mapping-audit" } },
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

function compact(value, limit = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? Array.from(text).slice(0, limit).join("") : "";
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

function hasAcceptedManualDeadline(verification = {}, storedDeadline) {
  if (!storedDeadline || verification.deadlineMatches !== true) return false;
  const dateQuality = verification.dateQuality && typeof verification.dateQuality === "object"
    ? verification.dateQuality
    : {};
  const acceptedExtractors = new Set([
    "date-period-manual-corrections-v1",
    "date-period-contest-correction-v1",
    "stale-date-warning-cleanup-v1",
  ]);
  return (
    dateQuality.decision === "pass" &&
    acceptedExtractors.has(dateQuality.updatedBy) &&
    dateKey(dateQuality.storedDeadline) === storedDeadline &&
    dateKey(dateQuality.normalizedDeadline) === storedDeadline &&
    dateKey(dateQuality.suggestedDeadline) === storedDeadline
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

function classifyRow(row) {
  const storedDeadline = dateKey(row.application_end_at);
  const dateQuality = evaluatePosterDateQuality(row, { extractedDeadline: storedDeadline });
  const verification = row.field_verification && typeof row.field_verification === "object"
    ? row.field_verification
    : {};
  const acceptedManualDeadline = hasAcceptedManualDeadline(verification, storedDeadline);
  const verificationDateCandidates = dateCandidatesFromVerification(verification);
  const staleWarning = hasDateWarning(verification)
    && storedDeadline
    && verificationDateCandidates.includes(storedDeadline)
    && !hasActionableAuditIssue(dateQuality);

  const issueCodes = asArray(dateQuality.issues).map((issue) => issue.code).filter(Boolean);
  const suggestedDeadline = dateQuality.suggestedDeadline ? dateKey(dateQuality.suggestedDeadline) : null;
  const mismatch = Boolean(
    storedDeadline &&
    suggestedDeadline &&
    storedDeadline !== suggestedDeadline &&
    issueCodes.includes("deadline-mismatch") &&
    !acceptedManualDeadline,
  );
  const missingClearDeadline = Boolean(!storedDeadline && suggestedDeadline && issueCodes.includes("missing-clear-deadline"));

  return {
    id: row.id,
    title: row.title,
    status: row.poster_status,
    org: row.organizer_name ?? row.source_org_name,
    source_key: row.source_key,
    application_start_at: dateKey(row.application_start_at),
    application_end_at: storedDeadline,
    event_start_at: dateKey(row.event_start_at),
    event_end_at: dateKey(row.event_end_at),
    audit_decision: dateQuality.decision,
    audit_suggested_deadline: suggestedDeadline,
    audit_issue_codes: issueCodes,
    audit_issues: asArray(dateQuality.issues).map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      reason: issue.reason,
      evidence: issue.evidence,
    })),
    verification_deadline_matches: verification.deadlineMatches,
    verification_date_issues: asArray(verification.dateIssues).map((issue) => ({
      code: issue.code,
      reason: issue.reason,
      evidence: issue.evidence,
    })),
    verification_date_quality: verification.dateQuality ?? null,
    stale_warning: staleWarning,
    mismatch,
    missing_clear_deadline: missingClearDeadline,
    summary_hint: compact(row.summary_short || row.summary_long, 360),
  };
}

async function fetchRows(supabase, statuses, limit) {
  const rows = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, limit - 1);
    const { data, error } = await supabase
      .from("posters")
      .select(
        [
          "id",
          "title",
          "source_org_name",
          "organizer_name",
          "poster_status",
          "source_key",
          "summary_short",
          "summary_long",
          "application_start_at",
          "application_end_at",
          "event_start_at",
          "event_end_at",
          "field_verification",
          "updated_at",
        ].join(","),
      )
      .in("poster_status", statuses)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const args = parseArgs();
  const statuses = String(args.statuses ?? "published,review")
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
  const limit = Number(args.limit ?? "5000");
  const outputPath = args.output ? path.resolve(args.output) : REPORT_PATH;

  const supabase = createSupabase();
  const rows = await fetchRows(supabase, statuses, limit);
  const audited = rows.map(classifyRow);
  const staleWarnings = audited.filter((row) => row.stale_warning);
  const mismatches = audited.filter((row) => row.mismatch);
  const missingClearDeadlines = audited.filter((row) => row.missing_clear_deadline);
  const actionable = audited.filter((row) => row.stale_warning || row.mismatch || row.missing_clear_deadline);

  const report = {
    generated_at: new Date().toISOString(),
    statuses,
    audited_count: audited.length,
    stale_warning_count: staleWarnings.length,
    mismatch_count: mismatches.length,
    missing_clear_deadline_count: missingClearDeadlines.length,
    issue_counts: audited.flatMap((row) => row.audit_issue_codes).reduce((acc, code) => {
      acc[code] = (acc[code] ?? 0) + 1;
      return acc;
    }, {}),
    stale_warnings: staleWarnings,
    mismatches,
    missing_clear_deadlines: missingClearDeadlines,
    actionable,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`audited=${report.audited_count}`);
  console.log(`stale_warning=${report.stale_warning_count}`);
  console.log(`mismatch=${report.mismatch_count}`);
  console.log(`missing_clear_deadline=${report.missing_clear_deadline_count}`);
  console.log(`actionable=${report.actionable.length}`);
  console.log(`report=${outputPath}`);
  for (const row of actionable.slice(0, 20)) {
    console.log(`- [${row.status}] ${row.title} :: stored=${row.application_end_at ?? "-"} suggested=${row.audit_suggested_deadline ?? "-"} issues=${row.audit_issue_codes.join(",") || "-"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
