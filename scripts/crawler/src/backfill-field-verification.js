#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { buildTextVerificationUsageRow, logAiUsage } from "./ai-usage-logger.js";
import { verifyPosterFields } from "./poster-field-verifier.js";

const DEFAULT_OUTPUT = "data/results/field-verification-backfill.json";
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
  node src/backfill-field-verification.js [--limit=25] [--concurrency=1] [--output=data/results/field-verification-backfill.json] [--apply]

Backfills posters.field_verification for published/review posters that do not
yet have a verifier result. Without --apply, only writes a dry-run target report.
Progress is logged to stderr and the report is checkpointed after every row.`);
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

function compact(value, maxLength = 4500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function hasVerifierResult(fieldVerification) {
  if (!fieldVerification || typeof fieldVerification !== "object") return false;
  return Boolean(
    fieldVerification.deadlineMatches !== undefined
    || fieldVerification.orgNameMatches !== undefined
    || fieldVerification.organization
    || fieldVerification.fieldVerifierBackfilledAt
  );
}

async function fetchCandidates(supabase, limit) {
  const rows = [];
  const pageSize = 1000;

  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,application_end_at,summary_short,summary_long,source_key,field_verification,created_at")
      .in("poster_status", ["published", "review"])
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!hasVerifierResult(row.field_verification)) rows.push(row);
      if (rows.length >= limit) break;
    }
    if (data.length < pageSize) break;
  }

  return rows;
}

function buildContext(row) {
  return {
    title: row.title ?? "",
    site: row.source_org_name ?? "",
    sourceUrl: row.source_key ?? "",
    extractedDeadline: row.application_end_at ? String(row.application_end_at).slice(0, 10) : "",
    extractedOrgName: row.source_org_name ?? "",
    content: compact([row.title, row.summary_short, row.summary_long].filter(Boolean).join("\n")),
  };
}

async function main() {
  const supabase = createSupabase();
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const concurrency = Math.max(1, Math.min(5, Number(args.concurrency || 1)));
  const apply = Boolean(args.apply);
  const rows = await fetchCandidates(supabase, limit);
  const results = [];
  const startedAt = new Date().toISOString();
  let writeChain = Promise.resolve();

  async function writeReport() {
    const report = {
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      mode: apply ? "apply" : "dry-run",
      requested_limit: limit,
      concurrency,
      candidate_count: rows.length,
      processed_count: results.length,
      applied_count: apply ? results.filter((row) => row.status === "applied").length : 0,
      failed_count: results.filter((row) => row.status === "failed").length,
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
    console.error(`[verify:backfill] ${label} ${apply ? "applying" : "dry-run"}: ${row.title}`);

    const entry = {
      index,
      id: row.id,
      title: row.title,
      poster_status: row.poster_status,
      source_org_name: row.source_org_name,
      source_key: row.source_key,
      application_end_at: row.application_end_at,
      mode: apply ? "applied" : "dry-run",
      status: apply ? "pending" : "dry-run",
      started_at: new Date().toISOString(),
    };

    try {
      if (apply) {
        const verification = await verifyPosterFields(buildContext(row));
        const fieldVerification = {
          ...(row.field_verification ?? {}),
          ...verification,
          fieldVerifierBackfilledAt: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("posters")
          .update({ field_verification: fieldVerification })
          .eq("id", row.id);
        if (error) throw error;
        entry.status = "applied";
        entry.decision = verification.decision;
        entry.confidence = verification.confidence;
        entry.reason = verification.reason;
        if (verification.__aiUsage) {
          const usageResult = await logAiUsage(supabase, buildTextVerificationUsageRow({
            posterId: row.id,
            model: verification.__aiUsage.model,
            operation: verification.__aiUsage.operation,
            status: verification.__aiUsage.status,
            inputTokens: verification.__aiUsage.inputTokens,
            outputTokens: verification.__aiUsage.outputTokens,
            metadata: {
              decision: verification.decision,
              confidence: verification.confidence,
            },
          }));
          entry.ai_usage_log_status = usageResult.status;
          if (usageResult.error) entry.ai_usage_log_error = usageResult.error;
        }
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = error.message;
      console.error(`[verify:backfill] ${label} failed: ${error.message}`);
    } finally {
      entry.finished_at = new Date().toISOString();
    }

    results.push(entry);
    await checkpointReport();
    console.error(`[verify:backfill] ${label} ${entry.status}`);
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
    concurrency,
    sample: results.slice(0, 5).map((row) => ({
      title: row.title,
      decision: row.decision ?? null,
      confidence: row.confidence ?? null,
      status: row.status,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
