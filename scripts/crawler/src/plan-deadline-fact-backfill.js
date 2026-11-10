#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  extractStatedParticipants,
  inferStructuredDeadlineType,
} from "./poster-structured-fields.js";

const DEFAULT_OUTPUT = "data/eval/reports/deadline-fact-backfill-dryrun.json";
const BACKFILL_KEY = "deadlineFactBackfill20261102";
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
  node src/plan-deadline-fact-backfill.js [--output=${DEFAULT_OUTPUT}] [--apply]

Screen plan v1.0 section 09, for published posters already stored:
  - 상시/소진 시 마감 without that wording in the notice -> re-read (usually unknown)
  - empty target or count when the notice states them on a labeled line
Dry-run is the default. --apply needs the user's approval for production.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-deadline-fact-backfill" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const blank = (value) => !String(value ?? "").trim();

/** The change for one poster, or null. Pure, so it is tested without a database. */
export function planPosterBackfill(poster) {
  const text = [poster.title, poster.summary_long].filter(Boolean).join("\n");
  const changes = {};
  const reasons = [];

  if (["until_exhausted", "ongoing"].includes(poster.deadline_type)) {
    const next = inferStructuredDeadlineType({
      deadlineType: poster.deadline_type,
      applicationEndAt: poster.application_end_at,
      sourceText: text,
    });
    if (next !== poster.deadline_type) {
      changes.deadline_type = next;
      reasons.push(`${poster.deadline_type} without wording in the notice -> ${next}`);
    }
  }

  // Only a labeled participant line ("참가인원: 서울시민 20명"); the looser
  // general extractors would carry trailing page text into stored posters.
  if (blank(poster.eligibility_summary) || blank(poster.recruitment_count)) {
    const stated = extractStatedParticipants(poster.summary_long);
    if (blank(poster.eligibility_summary) && stated.eligibility) {
      changes.eligibility_summary = stated.eligibility;
      reasons.push("target stated on the participant line");
    }
    if (blank(poster.recruitment_count) && stated.count) {
      changes.recruitment_count = stated.count;
      reasons.push("count stated on the participant line");
    }
  }

  return Object.keys(changes).length ? { changes, reasons } : null;
}

async function fetchPublished(supabase) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("posters")
      .select("id,title,summary_long,deadline_type,application_end_at,eligibility_summary,recruitment_count,field_verification")
      .eq("poster_status", "published")
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function applyPlan(supabase, items) {
  const applied = [];
  for (const item of items) {
    const { poster, changes, reasons } = item;
    let query = supabase
      .from("posters")
      .update({
        ...changes,
        field_verification: {
          ...(poster.field_verification ?? {}),
          [BACKFILL_KEY]: {
            at: new Date().toISOString(),
            reasons,
            previous: Object.fromEntries(Object.keys(changes).map((key) => [key, poster[key] ?? null])),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", poster.id)
      .eq("poster_status", "published");
    // Only change rows still as read, so a concurrent edit is never overwritten.
    for (const key of Object.keys(changes)) {
      query = poster[key] === null || poster[key] === undefined
        ? query.is(key, null)
        : query.eq(key, poster[key]);
    }
    const { data, error } = await query.select("id");
    if (error) throw error;
    if (data?.length) applied.push(poster.id);
  }
  return applied;
}

async function main() {
  const supabase = createSupabase();
  const apply = Boolean(args.apply);
  const output = String(args.output || DEFAULT_OUTPUT);
  const rows = await fetchPublished(supabase);
  const items = rows
    .map((poster) => ({ poster, ...(planPosterBackfill(poster) ?? {}) }))
    .filter((item) => item.changes);
  const applied = apply ? await applyPlan(supabase, items) : [];

  const count = (key) => items.filter((item) => key in item.changes).length;
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    checked_count: rows.length,
    candidate_count: items.length,
    deadline_type_changes: count("deadline_type"),
    eligibility_fills: count("eligibility_summary"),
    recruitment_count_fills: count("recruitment_count"),
    applied_count: applied.length,
    candidates: items.map(({ poster, changes, reasons }) => ({
      id: poster.id,
      title: poster.title,
      previous: Object.fromEntries(Object.keys(changes).map((key) => [key, poster[key] ?? null])),
      changes,
      reasons,
    })),
  };
  const outputPath = path.resolve(REPO_ROOT, output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  const { candidates, ...summary } = report;
  console.log(JSON.stringify({ output, ...summary }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
