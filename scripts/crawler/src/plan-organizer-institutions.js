// Offline dry-run: group organizer candidates into canonical institutions.
//
//   node src/plan-organizer-institutions.js --input <snapshot.jsonl> --sql <preview.sql> --csv <review.csv> [--min-confidence 0.7]
//
// Writes a SQL PREVIEW (never executed here) and a review CSV. No database
// client, no apply mode. Matching against existing institutions only knows the
// source institutions present in the snapshot; the SQL re-resolves by name so
// that other existing rows are reused instead of duplicated.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { readJsonl } from "./audit-card-facts.js";
import {
  CARD_FACTS_VERSION,
  extractOrganizerCandidate,
  isAggregatorSource,
  normalizeOrgKey,
} from "./poster-card-facts.js";

export function parseArgs(argv) {
  const args = { input: null, sql: null, csv: null, minConfidence: 0.7 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, null];
    const value = () => inline ?? argv[++index];
    if (flag === "--input") args.input = value();
    else if (flag === "--sql") args.sql = value();
    else if (flag === "--csv") args.csv = value();
    else if (flag === "--min-confidence") args.minConfidence = Number(value());
    else if (flag === "--apply") throw new Error("plan-organizer-institutions only writes a preview: there is no --apply mode");
  }
  return args;
}

/** Same slug convention as ensure_verified_institution(): org-<md5(lower(trim(name)))[0:16]>. */
export function institutionSlug(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  return `org-${crypto.createHash("md5").update(normalized, "utf8").digest("hex").slice(0, 16)}`;
}

function sameKey(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter) && /^(?:구|시|청)?$/.test(longer.slice(shorter.length));
}

export function collectExistingInstitutions(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!row.source_institution_id || byId.has(row.source_institution_id)) continue;
    byId.set(row.source_institution_id, {
      id: row.source_institution_id,
      name: row.source_institution_name,
      slug: row.source_institution_slug,
      key: normalizeOrgKey(row.source_institution_name),
      aggregator: isAggregatorSource({ slug: row.source_institution_slug, name: row.source_institution_name }),
    });
  }
  return [...byId.values()];
}

export function planOrganizerInstitutions(rows, { minConfidence = 0.7 } = {}) {
  const existing = collectExistingInstitutions(rows);
  const groups = new Map();
  const skipped = { noCandidate: 0, lowConfidence: 0 };
  const posterRows = [];

  for (const row of rows) {
    const candidate = extractOrganizerCandidate(row);
    if (!candidate) {
      skipped.noCandidate += 1;
      continue;
    }
    const key = normalizeOrgKey(candidate.name);
    const accepted = candidate.confidence >= minConfidence && Boolean(key);
    if (!accepted) skipped.lowConfidence += 1;
    posterRows.push({ row, candidate, key, accepted });
    if (!accepted) continue;
    if (!groups.has(key)) groups.set(key, { key, names: new Map(), posters: [], bases: {} });
    const group = groups.get(key);
    group.names.set(candidate.name, (group.names.get(candidate.name) ?? 0) + 1);
    group.posters.push(row.id);
    group.bases[candidate.basis] = (group.bases[candidate.basis] ?? 0) + 1;
  }

  // Merge groups whose keys differ only by a 구/시/청 suffix ("서울청년센터마포" stays separate
  // from "서울청년센터"; "강동구청" and "강동구" already share a key).
  const institutions = [];
  for (const group of groups.values()) {
    const displayName = [...group.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    // Aggregator channels (청년몽땅정보통, K-Startup, 서울특별시 portal) are collection
    // sources; an organizer named like one of them still gets matched only by name in SQL.
    const match = existing.find((institution) => !institution.aggregator && sameKey(institution.key, group.key));
    institutions.push({
      key: group.key,
      name: match ? match.name : displayName,
      variants: [...group.names.keys()],
      posterIds: group.posters,
      bases: group.bases,
      action: match ? "match_existing_source_institution" : "create_unverified",
      existingId: match?.id ?? null,
      existingSlug: match?.slug ?? null,
      slug: match?.slug ?? institutionSlug(displayName),
    });
  }
  institutions.sort((a, b) => b.posterIds.length - a.posterIds.length || a.name.localeCompare(b.name, "ko"));

  const summary = {
    posters: rows.length,
    postersWithCandidate: posterRows.length,
    postersLinked: institutions.reduce((sum, institution) => sum + institution.posterIds.length, 0),
    skipped,
    institutions: institutions.length,
    toCreate: institutions.filter((institution) => institution.action === "create_unverified").length,
    matchedExisting: institutions.filter((institution) => institution.action !== "create_unverified").length,
    postersLinkedToExisting: institutions
      .filter((institution) => institution.action !== "create_unverified")
      .reduce((sum, institution) => sum + institution.posterIds.length, 0),
    mergedVariants: institutions.filter((institution) => institution.variants.length > 1).length,
  };
  return { summary, institutions, posterRows };
}

function sqlString(value) {
  return value == null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;
}

export function buildSqlPreview({ summary, institutions }, { input, minConfidence }) {
  const lines = [];
  lines.push("-- =====================================================================");
  lines.push("-- PREVIEW ONLY - DO NOT RUN WITHOUT APPROVAL");
  lines.push("-- =====================================================================");
  lines.push(`-- Generated by scripts/crawler/src/plan-organizer-institutions.js (${CARD_FACTS_VERSION})`);
  lines.push(`-- Input snapshot: ${input}; min confidence ${minConfidence}`);
  lines.push(`-- Institutions: ${summary.institutions} (create ${summary.toCreate}, match existing ${summary.matchedExisting}); posters to link: ${summary.postersLinked}`);
  lines.push("--");
  lines.push("-- Notes before any approval:");
  lines.push("--  * Organizer candidates are machine extractions (needs_review). Review organizer-review.csv first.");
  lines.push("--  * New institutions are inserted as verification_status='unverified', is_public=false.");
  lines.push("--  * Existing institutions are reused by LOWER(BTRIM(name)) (idx_institutions_normalized_name).");
  lines.push("--  * trg invalidate_verified_poster_institution_change: changing organizer_id on a");
  lines.push("--    verification_status='verified' poster sets it back to 'needs_review'. The UPDATE below");
  lines.push("--    therefore skips verified posters and posters that already have an organizer_id.");
  lines.push("--  * Rollback: UPDATE posters SET organizer_id = NULL WHERE id IN (<ids below>);");
  lines.push("--    DELETE FROM institutions WHERE slug IN (<slugs created below>) AND verification_status = 'unverified';");
  lines.push("-- Verification (read-only):");
  lines.push("--   SELECT count(*) FROM posters WHERE organizer_id IS NOT NULL;");
  lines.push("--   SELECT verification_status, is_public, count(*) FROM institutions GROUP BY 1, 2;");
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");
  lines.push("-- 1. Institutions (create unverified; skipped when the name already exists)");
  for (const institution of institutions.filter((item) => item.action === "create_unverified")) {
    lines.push(
      `INSERT INTO institutions (slug, name, verification_status, is_public) VALUES (${sqlString(institution.slug)}, ${sqlString(institution.name)}, 'unverified', false) ON CONFLICT DO NOTHING; -- ${institution.posterIds.length} posters; variants: ${institution.variants.join(" / ").replace(/\n/g, " ")}`,
    );
  }
  lines.push("");
  lines.push("-- 2. Poster links");
  for (const institution of institutions) {
    const resolver = institution.existingId
      ? sqlString(institution.existingId)
      : `(SELECT id FROM institutions WHERE LOWER(BTRIM(name)) = LOWER(BTRIM(${sqlString(institution.name)})) LIMIT 1)`;
    const ids = institution.posterIds.map(sqlString).join(", ");
    lines.push(`-- ${institution.name} (${institution.action})`);
    lines.push(
      `UPDATE posters SET organizer_id = ${resolver} WHERE id IN (${ids}) AND organizer_id IS NULL AND verification_status IS DISTINCT FROM 'verified';`,
    );
  }
  lines.push("");
  lines.push("-- Review counts here, then ROLLBACK unless the run was approved.");
  lines.push("ROLLBACK;");
  return `${lines.join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReviewCsv({ institutions, posterRows }) {
  const institutionByKey = new Map(institutions.map((institution) => [institution.key, institution]));
  const header = [
    "poster_id", "source", "title", "candidate", "basis", "confidence", "accepted",
    "canonical_name", "action", "existing_slug", "existing_organizer_name", "evidence", "reviewer_decision", "reviewer_note",
  ];
  const lines = [header.join(",")];
  for (const { row, candidate, key, accepted } of posterRows) {
    const institution = accepted ? institutionByKey.get(key) : null;
    lines.push([
      row.id,
      row.source_institution_name ?? row.source_org_name,
      row.title,
      candidate.name,
      candidate.basis,
      candidate.confidence,
      accepted ? "yes" : "no",
      institution?.name ?? "",
      institution?.action ?? "below_threshold",
      institution?.existingSlug ?? "",
      row.organizer_name ?? "",
      candidate.evidence,
      "",
      "",
    ].map(csvCell).join(","));
  }
  // UTF-8 BOM so spreadsheet apps detect Korean text.
  return `﻿${lines.join("\r\n")}\r\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.sql || !args.csv) {
    console.error("usage: node src/plan-organizer-institutions.js --input <snapshot.jsonl> --sql <preview.sql> --csv <review.csv> [--min-confidence 0.7]");
    process.exit(1);
  }
  const rows = await readJsonl(args.input);
  const plan = planOrganizerInstitutions(rows, { minConfidence: args.minConfidence });
  await fs.writeFile(args.sql, buildSqlPreview(plan, { input: path.basename(args.input), minConfidence: args.minConfidence }), "utf8");
  await fs.writeFile(args.csv, buildReviewCsv(plan), "utf8");
  console.log("organizer institution plan (dry-run, nothing executed)");
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log("\ntop institutions:");
  for (const institution of plan.institutions.slice(0, 25)) {
    console.log(`  ${institution.posterIds.length}\t${institution.action}\t${institution.name}${institution.variants.length > 1 ? `  [${institution.variants.join(" / ")}]` : ""}`);
  }
  console.log(`\nSQL preview: ${args.sql}\nreview CSV: ${args.csv}`);
}

const isDirectExecution = Boolean(process.argv[1] && path.basename(process.argv[1]) === "plan-organizer-institutions.js");
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
