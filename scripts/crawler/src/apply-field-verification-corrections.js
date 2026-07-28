#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT = "data/results/field-verification-corrections.json";
const DEFAULT_LIMIT = 1000;
const DEFAULT_MIN_CONFIDENCE = 0.85;
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
  node src/apply-field-verification-corrections.js [--limit=1000] [--statuses=published,review] [--min-confidence=0.85] [--output=data/results/field-verification-corrections.json] [--apply]

Applies high-confidence field_verification correctedDeadline/correctedOrgName values
to posters.application_end_at and posters.source_org_name. Without --apply, writes
a dry-run report only.`);
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

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : text;
}

function normalizeText(value, maxLength = 200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function dateKey(value) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 10) : null;
}

function getOrganizationCandidate(verification) {
  return normalizeText(
    verification?.correctedOrgName
      ?? verification?.organization?.displayOrgName
      ?? verification?.organizerName
      ?? verification?.hostName
  );
}

function getCorrection(row, minConfidence) {
  const verification = row.field_verification;
  if (!verification || typeof verification !== "object") return null;

  const confidence = Number(verification.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < minConfidence) return null;

  const updates = {};
  const changes = [];

  const correctedDeadline = normalizeDate(verification.correctedDeadline);
  if (correctedDeadline && verification.deadlineMatches === false && dateKey(row.application_end_at) !== correctedDeadline) {
    updates.application_end_at = correctedDeadline;
    changes.push({
      field: "application_end_at",
      old: dateKey(row.application_end_at),
      next: correctedDeadline,
    });
  }

  const orgConfidence = Number(verification.organizationConfidence ?? verification.organization?.confidence ?? confidence);
  const correctedOrgName = orgConfidence >= minConfidence ? getOrganizationCandidate(verification) : null;
  if (correctedOrgName && verification.orgNameMatches === false && correctedOrgName !== row.source_org_name) {
    updates.source_org_name = correctedOrgName;
    changes.push({
      field: "source_org_name",
      old: row.source_org_name ?? null,
      next: correctedOrgName,
    });
  }

  if (changes.length === 0) return null;

  return {
    updates,
    changes,
    confidence,
    organizationConfidence: orgConfidence,
  };
}

async function fetchRows(supabase, limit, statuses) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,application_end_at,source_key,field_verification,created_at")
      .in("poster_status", statuses)
      .not("field_verification", "is", null)
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
  const minConfidence = Math.max(0, Math.min(1, Number(args["min-confidence"] || DEFAULT_MIN_CONFIDENCE)));
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const apply = Boolean(args.apply);
  const statuses = String(args.statuses || "published,review")
    .split(/[,\s]+/)
    .map((status) => status.trim())
    .filter(Boolean);

  const rows = await fetchRows(supabase, limit, statuses);
  const candidates = rows
    .map((row) => ({ row, correction: getCorrection(row, minConfidence) }))
    .filter(({ correction }) => correction);

  const reportRows = [];
  for (const { row, correction } of candidates) {
    if (apply) {
      const { error } = await supabase
        .from("posters")
        .update(correction.updates)
        .eq("id", row.id)
        .in("poster_status", statuses);
      if (error) throw error;
    }

    reportRows.push({
      id: row.id,
      title: row.title,
      poster_status: row.poster_status,
      source_key: row.source_key,
      confidence: correction.confidence,
      organizationConfidence: correction.organizationConfidence,
      changes: correction.changes,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    min_confidence: minConfidence,
    scanned_count: rows.length,
    correction_count: reportRows.length,
    rows: reportRows,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({
    output,
    mode: report.mode,
    scanned_count: report.scanned_count,
    correction_count: report.correction_count,
    sample: reportRows.slice(0, 10).map((row) => ({
      title: row.title,
      changes: row.changes,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
