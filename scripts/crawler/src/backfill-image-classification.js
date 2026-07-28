#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { classifyPosterImage } from "./poster-image-classifier.js";

const DEFAULT_OUTPUT = "data/results/image-classification-backfill.json";
const DEFAULT_LIMIT = 25;
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
  node src/backfill-image-classification.js [--limit=25] [--concurrency=1] [--statuses=published,review] [--output=data/results/image-classification-backfill.json] [--apply]

Backfills field_verification.posterImageOcr.imageClassification for posters that
have a thumbnail but no stored image classification. Without --apply, only writes
a dry-run candidate report.`);
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

function hasImageClassification(fieldVerification) {
  return Boolean(fieldVerification?.posterImageOcr?.imageClassification);
}

async function fetchCandidates(supabase, limit, statuses) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,thumbnail_url,source_key,summary_short,summary_long,field_verification,created_at")
      .in("poster_status", statuses)
      .not("thumbnail_url", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!hasImageClassification(row.field_verification)) rows.push(row);
      if (rows.length >= limit) break;
    }
    if (data.length < pageSize) break;
  }

  return rows;
}

function compact(value, maxLength = 4500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildContext(row) {
  return {
    title: row.title ?? "",
    site: row.source_org_name ?? "",
    sourceOrgName: row.source_org_name ?? "",
    sourceUrl: row.source_key ?? "",
    content: compact([row.title, row.summary_short, row.summary_long].filter(Boolean).join("\n")),
  };
}

function mergeImageClassification(fieldVerification = {}, classification) {
  const posterImageOcr = fieldVerification.posterImageOcr && typeof fieldVerification.posterImageOcr === "object"
    ? fieldVerification.posterImageOcr
    : {};

  return {
    ...fieldVerification,
    posterImageOcr: {
      ...posterImageOcr,
      imageClassification: classification,
    },
  };
}

async function main() {
  const supabase = createSupabase();
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const concurrency = Math.max(1, Math.min(5, Number(args.concurrency || 1)));
  const apply = Boolean(args.apply);
  const statuses = String(args.statuses || "published,review")
    .split(/[,\s]+/)
    .map((status) => status.trim())
    .filter(Boolean);
  const rows = await fetchCandidates(supabase, limit, statuses);
  const results = [];
  const startedAt = new Date().toISOString();
  let writeChain = Promise.resolve();

  async function writeReport() {
    const report = {
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      mode: apply ? "apply" : "dry-run",
      statuses,
      requested_limit: limit,
      concurrency,
      candidate_count: rows.length,
      processed_count: results.length,
      applied_count: apply ? results.filter((row) => row.status === "applied").length : 0,
      failed_count: results.filter((row) => row.status === "failed").length,
      nonposter_count: results.filter((row) => row.isPoster === false).length,
      rows: [...results].sort((a, b) => a.index - b.index),
    };

    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");
    return report;
  }

  function checkpointReport() {
    writeChain = writeChain.then(writeReport, writeReport);
    return writeChain;
  }

  async function processRow(row, index) {
    const label = `${index + 1}/${rows.length}`;
    console.error(`[image:backfill] ${label} ${apply ? "applying" : "dry-run"}: ${row.title}`);

    const entry = {
      index,
      id: row.id,
      title: row.title,
      poster_status: row.poster_status,
      thumbnail_url: row.thumbnail_url,
      source_key: row.source_key,
      status: apply ? "pending" : "dry-run",
      started_at: new Date().toISOString(),
    };

    try {
      if (apply) {
        const classification = await classifyPosterImage(row.thumbnail_url, buildContext(row));
        const { error } = await supabase
          .from("posters")
          .update({ field_verification: mergeImageClassification(row.field_verification ?? {}, classification) })
          .eq("id", row.id)
          .in("poster_status", statuses);
        if (error) throw error;
        entry.status = "applied";
        entry.isPoster = classification.isPoster;
        entry.confidence = classification.confidence;
        entry.visualType = classification.visualType;
        entry.reason = classification.reason;
        entry.model = classification.model;
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = error.message;
      console.error(`[image:backfill] ${label} failed: ${error.message}`);
    } finally {
      entry.finished_at = new Date().toISOString();
    }

    results.push(entry);
    await checkpointReport();
    console.error(`[image:backfill] ${label} ${entry.status}`);
  }

  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (nextIndex < rows.length) {
      const index = nextIndex;
      nextIndex += 1;
      await processRow(rows[index], index);
    }
  });

  await Promise.all(workers);
  await writeChain;
  const report = await writeReport();

  console.log(JSON.stringify({
    output,
    mode: report.mode,
    candidate_count: report.candidate_count,
    applied_count: report.applied_count,
    failed_count: report.failed_count,
    nonposter_count: report.nonposter_count,
    concurrency,
    sample: report.rows.slice(0, 5).map((row) => ({
      title: row.title,
      status: row.status,
      isPoster: row.isPoster ?? null,
      confidence: row.confidence ?? null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
