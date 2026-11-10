#!/usr/bin/env node
/**
 * Fills poster_regions.basis for open posters linked to 구 only, and adds the
 * 서울 link a 서울-wide poster needs to show in every 구 of the v6.1 home
 * (docs/design/v6.1 SPEC 8; home rule: a poster linked to 서울 shows in every 구).
 *
 *   node src/region-basis-backfill.js --snapshot=<file.jsonl>   offline dry-run
 *   node src/region-basis-backfill.js                            live dry-run
 *   node src/region-basis-backfill.js --apply --confirm=REGION_BASIS_BACKFILL
 *   node src/region-basis-backfill.js --rollback=<backup.json> [--apply --confirm=…]
 *
 * Options:
 *   --kinds=seoul_wide,gu_restricted   decisions to write (default). Add
 *                                       gu_preferred and/or open only after a
 *                                       person decided on them.
 *   --scope=all | seoul-affiliates      organiser group to write (default all).
 *   --out=<dir>                         report folder (default data/results).
 *
 * Writes, never overwriting a basis a person or the crawler already set:
 *   - seoul_wide (and gu_preferred / open when chosen): insert (poster, 서울,
 *     basis 'eligibility'); the 구 links get venue / institution / related.
 *   - gu_restricted: the named 구 links get 'eligibility'; nothing is added.
 * review and unknown posters are listed for a person and left alone.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { classifyRegionBasis } from "./poster-card-facts.js";
import {
  classifyRegionEligibility,
  organizerGroup,
  REGION_ELIGIBILITY_RULES_VERSION,
  targetTexts,
} from "./region-eligibility.js";

export const APPLY_CONFIRM = "REGION_BASIS_BACKFILL";
export const DEFAULT_KINDS = ["seoul_wide", "gu_restricted"];
const ADDS_SEOUL = new Set(["seoul_wide", "gu_preferred", "open"]);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(
  path.resolve(__dirname, "../../.."),
  "data",
  "results",
);

export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    args[key] = rest.length ? rest.join("=") : true;
  }
  return args;
}

/** Basis for a 구 link that is not about who may apply. */
function placeBasis(row, link) {
  const [result] = classifyRegionBasis(
    {
      regions: [{ code: link.code, name: link.name }],
      fv_regions: (row.fv_regions ?? []).filter((r) => r?.code === link.code),
      event_location: row.event_location,
      facts: { location: row.facts?.location ?? null },
      eligibility_summary: null,
      source_institution_name: row.source_org_name ?? null,
    },
    { organizerName: row.organizer_name ?? null },
  );
  // Who may apply was decided by region-eligibility; never here.
  return result && result.basis !== "eligibility"
    ? { basis: result.basis, evidence: result.evidence }
    : { basis: "related", evidence: "no place evidence" };
}

/**
 * One poster's plan. row.links: [{region_id, code, name, level, basis}].
 * Returns null for posters outside the target (not 구-only).
 */
export function planPoster(
  row,
  { seoulRegionId, kinds = DEFAULT_KINDS, scope = "all" } = {},
) {
  const links = row.links ?? [];
  if (!links.length || !links.every((link) => link.level === "sigungu"))
    return null;
  const decision = classifyRegionEligibility(targetTexts(row));
  const group = organizerGroup(row.organizer_name);
  const plan = {
    id: row.id,
    title: row.title,
    organizer: row.organizer_name ?? null,
    group,
    gus: links.map((link) => link.name),
    kind: decision.kind,
    evidence: decision.evidence,
    actions: [],
    skipped: null,
  };
  if (!kinds.includes(decision.kind)) {
    plan.skipped = ["review", "unknown"].includes(decision.kind)
      ? "needs_person"
      : "kind_not_chosen";
    return plan;
  }
  if (scope === "seoul-affiliates" && group !== "seoul_affiliate") {
    plan.skipped = "out_of_scope";
    return plan;
  }
  if (ADDS_SEOUL.has(decision.kind)) {
    plan.actions.push({
      op: "insert",
      region_id: seoulRegionId,
      code: "REG_SEOUL",
      basis: "eligibility",
      evidence: decision.evidence,
    });
  }
  for (const link of links) {
    if (link.basis) continue;
    if (decision.kind === "gu_restricted" && decision.gus.includes(link.name)) {
      plan.actions.push({
        op: "set_basis",
        region_id: link.region_id,
        code: link.code,
        basis: "eligibility",
        evidence: decision.evidence,
      });
      continue;
    }
    const place = placeBasis(row, link);
    plan.actions.push({
      op: "set_basis",
      region_id: link.region_id,
      code: link.code,
      ...place,
    });
  }
  return plan;
}

export function summarize(plans) {
  const count = (list, key) =>
    list.reduce(
      (out, item) => ({ ...out, [item[key]]: (out[item[key]] ?? 0) + 1 }),
      {},
    );
  const byGroup = {};
  for (const plan of plans) {
    byGroup[plan.group] ??= {};
    byGroup[plan.group][plan.kind] = (byGroup[plan.group][plan.kind] ?? 0) + 1;
  }
  const actions = plans.flatMap((plan) => plan.actions);
  return {
    posters: plans.length,
    byKind: count(plans, "kind"),
    byGroup,
    toWrite: plans.filter((plan) => plan.actions.length).length,
    seoulLinksAdded: actions.filter((a) => a.op === "insert").length,
    basisSet: count(
      actions.filter((a) => a.op === "set_basis"),
      "basis",
    ),
    skipped: count(
      plans.filter((plan) => plan.skipped),
      "skipped",
    ),
  };
}

async function readSnapshot(file) {
  const text = await fs.readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function createSupabase() {
  await import("./load-env.js");
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and the Supabase URL are required",
    );
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readLive(supabase) {
  const nowIso = new Date().toISOString();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("posters")
      .select(
        "id,title,organizer_name,source_org_name,eligibility_summary,event_location,summary_long,field_verification,application_end_at,poster_regions(region_id,basis,regions(code,name,level))",
      )
      .eq("poster_status", "published")
      .or(`application_end_at.is.null,application_end_at.gte.${nowIso}`)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows.map(toPlanRow);
}

/** Live rows and snapshot rows end up in the same shape. */
export function toPlanRow(row) {
  const verification = row.field_verification ?? {};
  return {
    id: row.id,
    title: row.title,
    organizer_name: row.organizer_name ?? null,
    source_org_name: row.source_org_name ?? null,
    eligibility_summary: row.eligibility_summary ?? null,
    event_location: row.event_location ?? null,
    summary_long: row.summary_long ?? null,
    facts: row.facts ?? verification.readableNotice?.facts ?? null,
    fv_regions: row.fv_regions ?? verification.classification?.regions ?? [],
    links:
      row.links ??
      (row.poster_regions ?? []).map((link) => ({
        region_id: link.region_id,
        basis: link.basis ?? null,
        code: link.regions?.code ?? null,
        name: link.regions?.name ?? null,
        level: link.regions?.level ?? null,
      })),
  };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeReport(dir, stamp, plans, summary) {
  await fs.mkdir(dir, { recursive: true });
  const json = path.join(dir, `region-basis-plan-${stamp}.json`);
  const csv = path.join(dir, `region-basis-plan-${stamp}.csv`);
  await fs.writeFile(
    json,
    JSON.stringify(
      {
        rules: REGION_ELIGIBILITY_RULES_VERSION,
        createdAt: new Date().toISOString(),
        summary,
        plans,
      },
      null,
      2,
    ),
  );
  const header = [
    "id",
    "group",
    "organizer",
    "gus",
    "kind",
    "skipped",
    "actions",
    "evidence",
    "title",
  ];
  const lines = plans.map((plan) =>
    [
      plan.id,
      plan.group,
      plan.organizer,
      plan.gus.join("·"),
      plan.kind,
      plan.skipped,
      plan.actions
        .map((a) => `${a.op === "insert" ? "+" : "="}${a.code}:${a.basis}`)
        .join(" "),
      plan.evidence,
      plan.title,
    ]
      .map(csvCell)
      .join(","),
  );
  await fs.writeFile(csv, `﻿${[header.join(","), ...lines].join("\n")}\n`);
  return { json, csv };
}

async function rollback(supabase, file, apply) {
  const backup = JSON.parse(await fs.readFile(file, "utf8"));
  const inserted = backup.items.filter(
    (item) => item.op === "insert" && item.written,
  );
  const updated = backup.items.filter(
    (item) => item.op === "set_basis" && item.written,
  );
  console.log(
    `rollback: delete ${inserted.length} added links, clear ${updated.length} basis values`,
  );
  if (!apply) return console.log("dry-run: nothing written");
  let failed = 0;
  for (const item of inserted) {
    const { error } = await supabase
      .from("poster_regions")
      .delete()
      .eq("poster_id", item.poster_id)
      .eq("region_id", item.region_id)
      .eq("basis", item.basis);
    if (error) failed += 1;
  }
  for (const item of updated) {
    const { error } = await supabase
      .from("poster_regions")
      .update({ basis: null })
      .eq("poster_id", item.poster_id)
      .eq("region_id", item.region_id)
      .eq("basis", item.basis);
    if (error) failed += 1;
  }
  console.log(`rolled back with ${failed} errors`);
  if (failed) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== APPLY_CONFIRM)
    throw new Error(`--apply needs --confirm=${APPLY_CONFIRM}`);
  if (apply && args.snapshot)
    throw new Error("--apply reads the live database; drop --snapshot");
  const kinds = args.kinds ? String(args.kinds).split(",") : DEFAULT_KINDS;
  const scope = args.scope ?? "all";
  const outDir = args.out ? path.resolve(String(args.out)) : RESULTS_DIR;

  const supabase = args.snapshot ? null : await createSupabase();
  if (args.rollback) return rollback(supabase, String(args.rollback), apply);

  let seoulRegionId = args["seoul-id"] ?? null;
  if (supabase) {
    const { data, error } = await supabase
      .from("regions")
      .select("id")
      .eq("code", "REG_SEOUL")
      .single();
    if (error) throw error;
    seoulRegionId = data.id;
  }
  if (!seoulRegionId)
    throw new Error("--seoul-id=<uuid> is required with --snapshot");

  const rows = args.snapshot
    ? (await readSnapshot(String(args.snapshot))).map(toPlanRow)
    : await readLive(supabase);
  const plans = rows
    .map((row) => planPoster(row, { seoulRegionId, kinds, scope }))
    .filter(Boolean);
  const summary = summarize(plans);
  console.log(
    `rules ${REGION_ELIGIBILITY_RULES_VERSION} · kinds ${kinds.join(",")} · scope ${scope}`,
  );
  console.log(JSON.stringify(summary, null, 2));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = await writeReport(outDir, stamp, plans, summary);
  console.log(`report: ${report.csv}`);
  if (!apply) return console.log("dry-run: nothing written");

  const items = plans.flatMap((plan) =>
    plan.actions.map((action) => ({
      poster_id: plan.id,
      ...action,
      written: false,
    })),
  );
  const backupFile = path.join(outDir, `region-basis-backup-${stamp}.json`);
  const saveBackup = () =>
    fs.writeFile(
      backupFile,
      JSON.stringify(
        { createdAt: new Date().toISOString(), kinds, scope, items },
        null,
        2,
      ),
    );
  await saveBackup();
  console.log(`backup: ${backupFile}`);
  let failed = 0;
  for (const item of items) {
    const result =
      item.op === "insert"
        ? await supabase
            .from("poster_regions")
            .upsert(
              {
                poster_id: item.poster_id,
                region_id: item.region_id,
                basis: item.basis,
              },
              { onConflict: "poster_id,region_id", ignoreDuplicates: true },
            )
            .select("poster_id")
        : await supabase
            .from("poster_regions")
            .update({ basis: item.basis })
            .eq("poster_id", item.poster_id)
            .eq("region_id", item.region_id)
            .is("basis", null)
            .select("poster_id");
    if (result.error || !result.data?.length) {
      failed += 1;
      console.log(
        `  ${item.poster_id.slice(0, 8)} ${item.op} ${item.code}: ${result.error?.message ?? "already set"}`,
      );
    } else item.written = true;
  }
  await saveBackup();
  console.log(`written ${items.length - failed} / ${items.length}`);
  if (failed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
