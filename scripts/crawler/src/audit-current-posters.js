#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { buildPosterDuplicateMaps, evaluatePosterQuality } from "./poster-quality-gate.js";

const REPORT_DIR = path.resolve("data");
const REPORT_PATH = path.join(REPORT_DIR, "poster-current-audit.json");
const CSV_PATH = path.join(REPORT_DIR, "poster-current-audit.csv");
const AUDIT_LIMIT = Number(process.env.POSTER_AUDIT_LIMIT ?? "5000");
const AUDIT_STATUSES = (process.env.POSTER_AUDIT_STATUSES ?? "published,review")
  .split(",")
  .map((status) => status.trim())
  .filter(Boolean);

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

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] ?? "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function toCsvValue(value) {
  const text = Array.isArray(value)
    ? value.join("; ")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchPosterRows(supabase, limit) {
  const rows = [];
  let totalCount = null;
  const pageSize = 1000;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    console.error(`[audit] fetching posters ${offset + 1}-${to + 1}`);
    const { data, error, count } = await supabase
      .from("posters")
      .select(
        "id,title,source_org_name,poster_status,created_at,updated_at,application_end_at,thumbnail_url,source_key,summary_short,summary_long",
        { count: offset === 0 ? "exact" : undefined }
      )
      .in("poster_status", AUDIT_STATUSES)
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (error) throw error;
    if (typeof count === "number") totalCount = count;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return { rows, count: totalCount ?? rows.length };
}

async function fetchByPosterIds(supabase, table, columns, posterIds, batchSize = 100) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += batchSize) {
    const batchIds = posterIds.slice(index, index + batchSize);
    console.error(`[audit] fetching ${table} ${index + 1}-${Math.min(index + batchSize, posterIds.length)} / ${posterIds.length}`);
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("poster_id", batchIds);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function groupByPosterId(rows) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.poster_id) ?? [];
    list.push(row);
    map.set(row.poster_id, list);
  }
  return map;
}

function auditPoster(row, duplicateMaps) {
  const quality = evaluatePosterQuality(row, { duplicateMaps });
  return {
    id: row.id,
    status: row.poster_status,
    decision: quality.decision,
    title: quality.title,
    org: quality.org,
    source_key: quality.source_key,
    thumbnail_url: quality.thumbnail_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    issue_score: quality.issue_score,
    issues: quality.issues,
  };
}

async function main() {
  const supabase = createSupabase();
  const { rows: posterRows, count } = await fetchPosterRows(supabase, AUDIT_LIMIT);
  const posterIds = posterRows.map((row) => row.id);
  console.error(`[audit] fetched ${posterRows.length} posters`);

  const [imageRows, linkRows] = await Promise.all([
    posterIds.length ? fetchByPosterIds(supabase, "poster_images", "poster_id,storage_path,image_type", posterIds) : [],
    posterIds.length ? fetchByPosterIds(supabase, "poster_links", "poster_id,url,title,link_type,is_primary", posterIds) : [],
  ]);
  console.error(`[audit] fetched ${imageRows.length} image rows and ${linkRows.length} link rows`);

  const imagesByPosterId = groupByPosterId(imageRows);
  const linksByPosterId = groupByPosterId(linkRows);
  const rows = posterRows.map((row) => ({
    ...row,
    poster_images: imagesByPosterId.get(row.id) ?? [],
    poster_links: linksByPosterId.get(row.id) ?? [],
  }));

  const duplicateMaps = buildPosterDuplicateMaps(rows);
  const audited = rows.map((row, index) => {
    if (index > 0 && index % 100 === 0) {
      console.error(`[audit] checked ${index} / ${rows.length}`);
    }
    return auditPoster(row, duplicateMaps);
  });
  console.error(`[audit] checked ${audited.length} / ${rows.length}`);

  const suspicious = audited
    .filter((row) => row.issues.length > 0)
    .sort((a, b) => b.issue_score - a.issue_score || String(b.updated_at).localeCompare(String(a.updated_at)));

  const summary = {
    generated_at: new Date().toISOString(),
    total_in_db: count,
    audited_count: rows.length,
    statuses: countBy(rows, "poster_status"),
    decision_counts: countBy(audited, "decision"),
    suspicious_count: suspicious.length,
    reject_risk_count: suspicious.filter((row) => row.decision === "reject").length,
    high_risk_count: suspicious.filter((row) => row.issues.some((issue) => issue.severity === "high")).length,
    issue_counts: suspicious.flatMap((row) => row.issues).reduce((acc, issue) => {
      acc[issue.code] = (acc[issue.code] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const report = {
    summary,
    top_suspicious: suspicious.slice(0, 80),
    all_suspicious: suspicious,
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  const csvRows = [
    ["status", "decision", "score", "title", "org", "source_key", "thumbnail_url", "issues", "id"].map(toCsvValue).join(","),
    ...suspicious.map((row) => [
      row.status,
      row.decision,
      row.issue_score,
      row.title,
      row.org,
      row.source_key,
      row.thumbnail_url,
      row.issues.map((issue) => `${issue.severity}:${issue.code}`),
      row.id,
    ].map(toCsvValue).join(",")),
  ];
  await fs.writeFile(CSV_PATH, csvRows.join("\n"), "utf-8");

  console.log(JSON.stringify({
    ...summary,
    report_path: REPORT_PATH,
    csv_path: CSV_PATH,
    top_20: suspicious.slice(0, 20).map((row) => ({
      status: row.status,
      decision: row.decision,
      score: row.issue_score,
      title: row.title,
      org: row.org,
      issues: row.issues.map((issue) => issue.code),
      source_key: row.source_key,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
