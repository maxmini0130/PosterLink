#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT = "data/eval/reports/close-expired-posters-dryrun.json";
const DEFAULT_LIMIT = 5000;
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
  node src/close-expired-posters.js [--limit=5000] [--output=data/eval/reports/close-expired-posters-dryrun.json] [--apply]

Finds published posters whose application end date has passed in Asia/Seoul.
Dry-run is the default. --apply changes poster_status to closed.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-close-expired-posters" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function kstDateKey(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return kstDateFormatter.format(new Date(time));
}

async function fetchPublishedPosters(supabase, limit) {
  const rows = [];
  const pageSize = Math.min(1000, limit);
  for (let offset = 0; rows.length < limit; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,source_org_name,poster_status,application_end_at,deadline_type,updated_at")
      .eq("poster_status", "published")
      .not("application_end_at", "is", null)
      .order("application_end_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows.slice(0, limit);
}

function findExpiredCandidates(rows, todayKst) {
  return rows
    .map((row) => ({ ...row, application_end_kst: kstDateKey(row.application_end_at) }))
    .filter((row) => row.application_end_kst && row.application_end_kst < todayKst)
    .map((row) => ({
      id: row.id,
      title: row.title,
      source_org_name: row.source_org_name,
      application_end_at: row.application_end_at,
      application_end_kst: row.application_end_kst,
      deadline_type: row.deadline_type,
      previous_status: row.poster_status,
      next_status: "closed",
    }));
}

async function applyCandidates(supabase, candidates) {
  const results = [];
  for (let i = 0; i < candidates.length; i += 500) {
    const chunk = candidates.slice(i, i + 500);
    const ids = chunk.map((candidate) => candidate.id);
    const { data, error } = await supabase
      .from("posters")
      .update({ poster_status: "closed", updated_at: new Date().toISOString() })
      .eq("poster_status", "published")
      .in("id", ids)
      .select("id,poster_status");
    if (error) throw error;
    results.push(...(data ?? []));
  }
  return results;
}

async function main() {
  const supabase = createSupabase();
  const limit = Math.min(Math.max(Number(args.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), 20000);
  const output = String(args.output || DEFAULT_OUTPUT);
  const apply = Boolean(args.apply);
  const todayKst = kstDateKey(new Date().toISOString());
  if (!todayKst) throw new Error("Unable to compute today's KST date");

  const rows = await fetchPublishedPosters(supabase, limit);
  const candidates = findExpiredCandidates(rows, todayKst);
  const applied = apply ? await applyCandidates(supabase, candidates) : [];
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    today_kst: todayKst,
    checked_count: rows.length,
    candidate_count: candidates.length,
    applied_count: applied.length,
    candidates,
  };

  const outputPath = path.resolve(REPO_ROOT, output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    output,
    mode: report.mode,
    today_kst: todayKst,
    checked_count: rows.length,
    candidate_count: candidates.length,
    applied_count: applied.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
