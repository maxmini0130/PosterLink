#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { inferPosterClassification } from "./poster-classifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_DIR = path.join(REPO_ROOT, "data", "eval", "reports");
const REPORT_PATH = path.join(REPORT_DIR, "contest-category-audit.json");
const PAGE_SIZE = 500;
const CATEGORY_BATCH_SIZE = 100;
const FETCH_RETRIES = 3;

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
    global: { headers: { "X-Client-Info": "posterlink-contest-category-audit" } },
  });
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function withRetry(label, operation) {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_RETRIES) break;
      const delayMs = 500 * attempt;
      console.error(`[audit] ${label} failed on attempt ${attempt}; retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function fetchPosters(supabase, statuses, limit) {
  const rows = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, limit - 1);
    const { data, error } = await withRetry(`posters ${from}-${to}`, () =>
      supabase
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
            "updated_at",
          ].join(","),
        )
        .in("poster_status", statuses)
        .order("updated_at", { ascending: false })
        .range(from, to),
    );

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchCategoryCodes(supabase, posterIds) {
  const rows = [];
  for (const ids of chunk(posterIds, CATEGORY_BATCH_SIZE)) {
    const { data, error } = await withRetry(`poster_categories ${rows.length}`, () =>
      supabase
        .from("poster_categories")
        .select("poster_id,categories(code,name)")
        .in("poster_id", ids),
    );
    if (error) throw error;
    rows.push(...(data ?? []));
  }

  const byPosterId = new Map();
  for (const row of rows) {
    const list = byPosterId.get(row.poster_id) ?? [];
    list.push(row.categories?.code ?? null);
    byPosterId.set(row.poster_id, list.filter(Boolean));
  }
  return byPosterId;
}

function auditPoster(row, currentCategoryCodes) {
  const currentCodes = currentCategoryCodes.get(row.id) ?? [];
  const inferred = inferPosterClassification({
    title: row.title,
    category: currentCodes.join(" "),
    summary_short: row.summary_short,
    content: row.summary_long,
    source_org_name: row.source_org_name,
    source_key: row.source_key,
  });
  const suggested = inferred.categories[0];

  return {
    id: row.id,
    title: row.title,
    status: row.poster_status,
    org: row.organizer_name ?? row.source_org_name,
    current_category_codes: currentCodes,
    suggested_category_code: suggested?.code ?? null,
    suggested_confidence: suggested?.confidence ?? null,
    suggested_evidence: suggested?.evidence ?? "",
    application_start_at: row.application_start_at,
    application_end_at: row.application_end_at,
    event_start_at: row.event_start_at,
    event_end_at: row.event_end_at,
    source_key: row.source_key,
    updated_at: row.updated_at,
  };
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
  const posters = await fetchPosters(supabase, statuses, limit);
  const currentCategoryCodes = await fetchCategoryCodes(supabase, posters.map((row) => row.id));

  const audited = posters.map((row) => auditPoster(row, currentCategoryCodes));
  const candidates = audited
    .filter((row) => row.suggested_category_code === "CAT_CONTEST")
    .filter((row) => !row.current_category_codes.includes("CAT_CONTEST"))
    .sort((a, b) => b.suggested_confidence - a.suggested_confidence || a.title.localeCompare(b.title, "ko"));

  const report = {
    generated_at: new Date().toISOString(),
    statuses,
    audited_count: audited.length,
    candidate_count: candidates.length,
    candidates,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`audited=${audited.length}`);
  console.log(`contest_category_candidates=${candidates.length}`);
  console.log(`report=${outputPath}`);
  for (const row of candidates.slice(0, 20)) {
    console.log(`- [${row.status}] ${row.title} :: ${row.current_category_codes.join(",") || "-"} -> CAT_CONTEST`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
