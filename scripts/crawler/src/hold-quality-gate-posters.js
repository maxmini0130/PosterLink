#!/usr/bin/env node
/**
 * Sends published posters that fail a quality check back to the review
 * queue, one poster at a time, so the daily quality gate does not fail the
 * whole run for them. Rules: quality-gate-hold.js (image confidence,
 * non-poster image, quality-gate reject, pending deadline correction).
 *
 *   node src/hold-quality-gate-posters.js                       # dry-run
 *   node src/hold-quality-gate-posters.js --apply --confirm=QUALITY_GATE_HOLD [--max=10]
 *   node src/hold-quality-gate-posters.js --rollback=<report.json> [--apply --confirm=…]
 *
 * --max: more posters to hold than this means something systemic (a model
 * outage, a bad backfill); nothing is written and the command fails.
 * The report doubles as the backup: it keeps each poster's previous status and
 * field_verification. Rollback restores only posters still held by that run
 * (reports of the earlier hold-low-confidence-images.js too).
 */
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { imageConfidenceHoldOf } from "./image-confidence-hold.js";
import {
  QUALITY_GATE_HOLD_RULES,
  planQualityGateHold,
  qualityGateHoldOf,
  withQualityGateHold,
} from "./quality-gate-hold.js";

export const APPLY_CONFIRM = "QUALITY_GATE_HOLD";
const DEFAULT_MAX = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Reports land in scripts/crawler/data/results, which the workflow uploads.
const CRAWLER_ROOT = path.resolve(__dirname, "..");
export const POSTER_COLUMNS =
  "id,title,poster_status,exposure_tier,thumbnail_url,source_key,source_org_name,summary_short,summary_long,application_end_at,created_at,published_at,updated_at,field_verification";

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function fetchPublishedPosters(supabase) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select(POSTER_COLUMNS)
      .eq("poster_status", "published")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** The posters a run holds, with the plan for each. */
export function planHolds(rows) {
  return rows
    .map((row) => ({ row, plan: planQualityGateHold(row) }))
    .filter(({ plan }) => plan.action === "hold");
}

function line(row, plan) {
  return `${row.id.slice(0, 8)} | ${plan.reasons.map((reason) => reason.code).join(",")} | ${String(row.title ?? "").slice(0, 60)}`;
}

async function summaryNote(text) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await fs
    .appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`, "utf-8")
    .catch(() => {});
}

function heldAtOf(fieldVerification) {
  return (
    qualityGateHoldOf(fieldVerification)?.heldAt ??
    imageConfidenceHoldOf(fieldVerification)?.heldAt ??
    null
  );
}

async function rollback(supabase, file, apply) {
  const report = JSON.parse(await fs.readFile(file, "utf-8"));
  const items = (report.items ?? []).filter((item) => item.written);
  console.log(
    `rollback: ${items.length} posters held by ${report.runId ?? "(local run)"} at ${report.generated_at}`,
  );
  let restored = 0;
  for (const item of items) {
    const { data: current, error } = await supabase
      .from("posters")
      .select("id,poster_status,field_verification")
      .eq("id", item.id)
      .maybeSingle();
    if (error) throw error;
    const stillHeld =
      current?.poster_status === "review" &&
      heldAtOf(current?.field_verification) === item.heldAt;
    console.log(
      `  ${item.id.slice(0, 8)} ${stillHeld ? "restore to published" : `skip (now ${current?.poster_status ?? "missing"})`}`,
    );
    if (!stillHeld || !apply) continue;
    const { error: writeError } = await supabase
      .from("posters")
      .update({
        poster_status: item.previous.poster_status,
        field_verification: item.previous.field_verification,
      })
      .eq("id", item.id)
      .eq("poster_status", "review");
    if (writeError) throw writeError;
    restored += 1;
  }
  console.log(apply ? `restored ${restored}` : "dry-run: nothing written");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== APPLY_CONFIRM)
    throw new Error(`--apply needs --confirm=${APPLY_CONFIRM}`);
  const supabase = createSupabase();
  if (args.rollback)
    return rollback(supabase, path.resolve(String(args.rollback)), apply);

  const max = args.max === undefined ? DEFAULT_MAX : Number(args.max);
  if (!Number.isInteger(max) || max < 0)
    throw new Error("--max must be a non-negative integer");
  const now = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const output = path.resolve(
    CRAWLER_ROOT,
    String(
      args.output ||
        `data/results/quality-gate-hold-${now.replace(/[:.]/g, "-")}.json`,
    ),
  );

  const rows = await fetchPublishedPosters(supabase);
  const holds = planHolds(rows);
  console.log(
    `[quality-hold] ${QUALITY_GATE_HOLD_RULES} | published ${rows.length} | to hold ${holds.length} | max ${max} | ${apply ? "apply" : "dry-run"}`,
  );
  for (const { row, plan } of holds) console.log(`  ${line(row, plan)}`);

  const report = {
    generated_at: now,
    rules: QUALITY_GATE_HOLD_RULES,
    runId,
    mode: apply ? "apply" : "dry-run",
    scanned: rows.length,
    max,
    refused: holds.length > max,
    items: holds.map(({ row, plan }) => ({
      id: row.id,
      title: row.title,
      reasons: plan.reasons.map(({ code, text, fingerprint }) => ({
        code,
        text,
        fingerprint,
      })),
      heldAt: now,
      written: false,
      previous: {
        poster_status: row.poster_status,
        field_verification: row.field_verification ?? null,
      },
    })),
  };

  if (holds.length > max) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");
    await summaryNote(
      `### 품질 보류: 대상 ${holds.length}건이 상한 ${max}건을 넘어 쓰지 않았습니다\n원인(모델 장애, 잘못된 재분류 등)을 먼저 확인하세요.`,
    );
    throw new Error(
      `${holds.length} posters to hold exceeds --max=${max}; nothing written. Report: ${output}`,
    );
  }

  let written = 0;
  if (apply) {
    for (const [index, { row, plan }] of holds.entries()) {
      const { data, error } = await supabase
        .from("posters")
        .update({
          poster_status: "review",
          field_verification: withQualityGateHold(row.field_verification, plan, {
            now,
            runId,
          }),
        })
        .eq("id", row.id)
        .eq("poster_status", "published")
        .eq("updated_at", row.updated_at)
        .select("id");
      if (error) throw error;
      if (data?.length) {
        report.items[index].written = true;
        written += 1;
      } else {
        console.log(
          `  ${row.id.slice(0, 8)} changed since it was read; left for the next run`,
        );
      }
    }
  }
  report.written = written;

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");
  console.log(
    `[quality-hold] ${apply ? `held ${written}` : "dry-run: nothing written"} | report ${output}`,
  );
  if (apply && holds.length) {
    await summaryNote(
      [
        `### 품질 보류: ${written}건을 검수 대기로 보냈습니다`,
        ...report.items.map(
          (item) =>
            `- ${item.written ? "" : "(쓰지 못함) "}\`${item.id}\` ${item.title} — ${item.reasons.map((reason) => reason.text).join(" / ")}`,
        ),
      ].join("\n"),
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
