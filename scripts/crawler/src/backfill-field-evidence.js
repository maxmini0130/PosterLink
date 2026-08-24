#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  evidenceRowsFromReadableFacts,
  findEvidenceSentence,
  normalizeEvidenceRow,
} from "./field-evidence.js";
import { inferDeadlineTypeEvidence } from "./deadline-type-evidence.js";

const DEFAULT_OUTPUT = "data/results/field-evidence-backfill.json";
const DEFAULT_LIMIT = 2000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const POSTER_SELECT = [
  "id",
  "title",
  "source_org_name",
  "source_key",
  "poster_status",
  "summary_short",
  "summary_long",
  "application_start_at",
  "application_end_at",
  "deadline_type",
  "organizer_name",
  "eligibility_summary",
  "target_age_min",
  "target_age_max",
  "participation_fee",
  "benefits_summary",
  "recruitment_count",
  "application_method",
  "contact_info",
  "event_location",
  "field_verification",
  "created_at",
].join(",");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/backfill-field-evidence.js [--limit=2000] [--statuses=published,review] [--output=data/results/field-evidence-backfill.json] [--apply]

Builds poster_field_evidence rows from existing poster structured columns,
poster_links, and stored field_verification/readableNotice facts.
Dry-run is the default. --apply upserts rows into poster_field_evidence.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function compactSourceText(row) {
  return [row.title, row.summary_short, row.summary_long]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);
}

function isoDateText(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addRow(rows, row) {
  if (!row) return;
  const key = `${row.poster_id}:${row.field_key}:${row.extractor}`;
  if (rows.some((existing) => `${existing.poster_id}:${existing.field_key}:${existing.extractor}` === key)) {
    return;
  }
  rows.push(row);
}

function buildEvidenceRowsForPoster(row, links = []) {
  const rows = [];
  const sourceText = compactSourceText(row);
  const readableNotice = row.field_verification?.readableNotice;
  const readableFacts = readableNotice?.facts ?? {};
  const readableConfidence = readableNotice?.factsLlmMeta?.allFactsGroundedInText === false ? 0.55 : 0.75;

  for (const evidenceRow of evidenceRowsFromReadableFacts({
    posterId: row.id,
    facts: readableFacts,
    sourceText,
    confidence: readableConfidence,
  })) {
    addRow(rows, evidenceRow);
  }

  const organization = row.field_verification?.organization ?? {};
  const orgEvidence = organization.evidence ?? row.field_verification?.reason ?? sourceText;
  const orgName = row.organizer_name ?? organization.displayOrgName ?? organization.organizerName ?? row.source_org_name;
  addRow(rows, normalizeEvidenceRow({
    posterId: row.id,
    fieldKey: "host_org",
    valueText: orgName,
    valueJson: orgName ? { name: orgName } : null,
    confidence: organization.confidence ?? row.field_verification?.organizationConfidence ?? row.field_verification?.confidence ?? 0.55,
    evidenceText: orgEvidence,
    evidenceSrc: "body",
    extractor: row.field_verification?.model ?? "field-verifier-v1",
  }));

  const endDate = isoDateText(row.application_end_at);
  if (endDate) {
    addRow(rows, normalizeEvidenceRow({
      posterId: row.id,
      fieldKey: "deadline_date",
      valueText: endDate,
      valueJson: { date: endDate },
      confidence: row.field_verification?.deadlineMatches === false ? 0.45 : 0.85,
      evidenceText: findEvidenceSentence(sourceText, endDate) ?? readableFacts.period ?? endDate,
      evidenceSrc: "body",
      extractor: "regex-date-v1",
    }));
  }

  if (row.deadline_type && row.deadline_type !== "unknown") {
    addRow(rows, normalizeEvidenceRow({
      posterId: row.id,
      fieldKey: "deadline_type",
      valueText: row.deadline_type,
      valueJson: { type: row.deadline_type },
      confidence: 0.9,
      evidenceText: readableFacts.period ?? findEvidenceSentence(sourceText, row.deadline_type) ?? row.deadline_type,
      evidenceSrc: "rule",
      extractor: "deadline-type-v1",
    }));
  } else {
    addRow(rows, inferDeadlineTypeEvidence({
      posterId: row.id,
      sourceText,
      periodText: readableFacts.period,
      applicationEndAt: row.application_end_at,
      existingDeadlineType: row.deadline_type,
    }));
  }

  const officialNotice = links.find((link) => link.link_type === "official_notice");
  if (officialNotice?.url || row.source_key) {
    const url = officialNotice?.url ?? row.source_key;
    addRow(rows, normalizeEvidenceRow({
      posterId: row.id,
      fieldKey: "official_url",
      valueText: url,
      valueJson: { url },
      confidence: 0.95,
      evidenceText: url,
      evidenceSrc: "rule",
      extractor: "poster-link-v1",
    }));
  }

  const applyLink = links.find((link) => link.link_type === "official_apply");
  if (applyLink?.url) {
    addRow(rows, normalizeEvidenceRow({
      posterId: row.id,
      fieldKey: "apply_url",
      valueText: applyLink.url,
      valueJson: { url: applyLink.url },
      confidence: 0.9,
      evidenceText: applyLink.url,
      evidenceSrc: "rule",
      extractor: "poster-link-v1",
    }));
  }

  const simpleFields = [
    ["apply_start", isoDateText(row.application_start_at), row.application_start_at ? { date: isoDateText(row.application_start_at) } : null, readableFacts.period, "regex-date-v1", "body", 0.75],
    ["age_min", row.target_age_min, row.target_age_min == null ? null : { min: row.target_age_min }, row.eligibility_summary ?? readableFacts.target, "structured-column-v1", "body", 0.7],
    ["age_max", row.target_age_max, row.target_age_max == null ? null : { max: row.target_age_max }, row.eligibility_summary ?? readableFacts.target, "structured-column-v1", "body", 0.7],
    ["target_desc", row.eligibility_summary, null, row.eligibility_summary ?? readableFacts.target, "structured-column-v1", "body", 0.7],
    ["benefit", row.benefits_summary, null, row.benefits_summary ?? readableFacts.content, "structured-column-v1", "body", 0.7],
    ["apply_method", row.application_method, null, row.application_method ?? readableFacts.application, "structured-column-v1", "body", 0.7],
    ["cost", row.participation_fee, null, row.participation_fee, "structured-column-v1", "body", 0.7],
    ["contact", row.contact_info, null, row.contact_info ?? readableFacts.contact, "structured-column-v1", "body", 0.7],
    ["capacity", row.recruitment_count, null, row.recruitment_count, "structured-column-v1", "body", 0.7],
    ["venue", row.event_location, null, row.event_location ?? readableFacts.location, "structured-column-v1", "body", 0.7],
  ];

  for (const [fieldKey, value, valueJson, evidence, extractor, evidenceSrc, confidence] of simpleFields) {
    if (value == null || value === "") continue;
    addRow(rows, normalizeEvidenceRow({
      posterId: row.id,
      fieldKey,
      valueText: String(value),
      valueJson,
      confidence,
      evidenceText: findEvidenceSentence(sourceText, String(value)) ?? evidence,
      evidenceSrc,
      extractor,
    }));
  }

  return rows;
}

async function fetchRows(supabase, statuses, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select(POSTER_SELECT)
      .in("poster_status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

async function fetchLinks(supabase, posterIds) {
  if (posterIds.length === 0) return new Map();

  const byPosterId = new Map();
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("poster_links")
      .select("poster_id,url,link_type,is_primary")
      .in("poster_id", chunk);
    if (error) throw error;

    for (const link of data ?? []) {
      const rows = byPosterId.get(link.poster_id) ?? [];
      rows.push(link);
      byPosterId.set(link.poster_id, rows);
    }
  }
  return byPosterId;
}

async function main() {
  const supabase = createSupabase();
  const apply = Boolean(args.apply);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const statuses = String(args.statuses || "published,review")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);

  const posters = await fetchRows(supabase, statuses, limit);
  const linkMap = await fetchLinks(supabase, posters.map((row) => row.id));
  const plans = posters.map((poster) => ({
    id: poster.id,
    title: poster.title,
    poster_status: poster.poster_status,
    rows: buildEvidenceRowsForPoster(poster, linkMap.get(poster.id) ?? []),
  }));
  const evidenceRows = plans.flatMap((plan) => plan.rows);
  const results = [];

  if (apply && evidenceRows.length > 0) {
    for (let index = 0; index < evidenceRows.length; index += 500) {
      const chunk = evidenceRows.slice(index, index + 500);
      const { error } = await supabase
        .from("poster_field_evidence")
        .upsert(chunk, { onConflict: "poster_id,field_key,extractor" });
      results.push({
        index,
        count: chunk.length,
        status: error ? "failed" : "applied",
        error: error?.message ?? null,
      });
      if (error) console.error(`[field-evidence] upsert failed: ${error.message}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    statuses,
    checked_count: posters.length,
    poster_candidate_count: plans.filter((plan) => plan.rows.length > 0).length,
    evidence_row_count: evidenceRows.length,
    field_counts: evidenceRows.reduce((acc, row) => {
      acc[row.field_key] = (acc[row.field_key] ?? 0) + 1;
      return acc;
    }, {}),
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
    poster_candidate_count: report.poster_candidate_count,
    evidence_row_count: report.evidence_row_count,
    field_counts: report.field_counts,
    applied_count: report.applied_count,
    failed_count: report.failed_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
