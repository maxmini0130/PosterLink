#!/usr/bin/env node
/**
 * Replaces summary sentences that state a wrong deadline (SUMMARY_TEXT_FIXES
 * in date-only-deadline-manifest-20261110.js). Looks in summary_short,
 * summary_long, application_method and the strings in
 * field_verification.readableNotice (summaryShort, ...) and its facts.
 *
 * Dry-run unless --apply --confirm=REPAIR_SUMMARY_SENTENCES is given.
 *   --rollback=<file>   restores a backup this script wrote
 *
 * Writes are compare-and-set on updated_at, and the backup holds the full
 * before and after values. It is written before the first update.
 */
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SUMMARY_TEXT_FIXES } from "./date-only-deadline-manifest-20261110.js";
import { createSupabase, parseArgs } from "./repair-date-only-deadlines.js";

export const APPLY_CONFIRM = "REPAIR_SUMMARY_SENTENCES";
export const TEXT_COLUMNS = [
  "summary_short",
  "summary_long",
  "application_method",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(
  path.resolve(__dirname, "../../.."),
  "data",
  "results",
);
const COLUMNS = `id,title,updated_at,field_verification,${TEXT_COLUMNS.join(",")}`;

function replaceAll(text, from, to) {
  return typeof text === "string" && text.includes(from)
    ? text.split(from).join(to)
    : null;
}

/** The fields to write for one fix, or why there is nothing to write. */
export function planTextFix(row, fix) {
  if (!row) return { id: fix.id, action: "missing" };
  const before = {};
  const after = {};
  for (const column of TEXT_COLUMNS) {
    const next = replaceAll(row[column], fix.from, fix.to);
    if (next !== null) {
      before[column] = row[column];
      after[column] = next;
    }
  }
  const notice = row.field_verification?.readableNotice;
  const facts = notice?.facts;
  if (notice && typeof notice === "object") {
    const verification = structuredClone(row.field_verification);
    let changed = false;
    // readableNotice keeps copies of the summary (summaryShort, ...) next to facts.
    for (const target of [
      verification.readableNotice,
      facts && typeof facts === "object"
        ? verification.readableNotice.facts
        : null,
    ]) {
      if (!target) continue;
      for (const [key, value] of Object.entries(target)) {
        const next = replaceAll(value, fix.from, fix.to);
        if (next !== null) {
          target[key] = next;
          changed = true;
        }
      }
    }
    if (changed) {
      before.field_verification = row.field_verification;
      after.field_verification = verification;
    }
  }
  const fields = Object.keys(after);
  if (!fields.length) {
    const text = JSON.stringify([
      ...TEXT_COLUMNS.map((c) => row[c]),
      notice ?? null,
    ]);
    return {
      id: fix.id,
      title: row.title,
      action: text.includes(fix.to) ? "already" : "text-not-found",
    };
  }
  return {
    id: fix.id,
    title: row.title,
    action: "update",
    fields,
    from: fix.from,
    to: fix.to,
    updatedAt: row.updated_at,
    before,
    after,
  };
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Restore only fields that still hold what this script wrote. */
export function planRollback(row, item) {
  if (!row) return { ...item, action: "missing" };
  const intact = item.fields.every((field) =>
    sameValue(row[field], item.after[field]),
  );
  return {
    ...item,
    action: intact ? "restore" : "changed-since-repair",
    updatedAt: row.updated_at,
  };
}

async function fetchRows(supabase, ids) {
  const { data, error } = await supabase
    .from("posters")
    .select(COLUMNS)
    .in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function writeAll(supabase, items, values) {
  let written = 0;
  const notWritten = [];
  for (const item of items) {
    const { data, error } = await supabase
      .from("posters")
      .update({ ...item[values], updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id");
    if (error) notWritten.push({ id: item.id, reason: error.message });
    else if (!data?.length)
      notWritten.push({ id: item.id, reason: "row changed since read" });
    else written += 1;
  }
  console.log(`written: ${written}, not written: ${notWritten.length}`);
  for (const item of notWritten)
    console.log(`  ${item.id.slice(0, 8)} ${item.reason}`);
  if (notWritten.length) process.exitCode = 1;
}

function print(item) {
  const where = item.fields ? ` [${item.fields.join(", ")}]` : "";
  console.log(
    `${item.action.padEnd(20)} ${item.id.slice(0, 8)}${where}  ${item.title ?? ""}`,
  );
  if (item.from) console.log(`  "${item.from}" -> "${item.to}"`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== APPLY_CONFIRM)
    throw new Error(`--apply needs --confirm=${APPLY_CONFIRM}`);
  const supabase = createSupabase();

  if (args.rollback) {
    const backup = JSON.parse(await fs.readFile(args.rollback, "utf8"));
    const rows = await fetchRows(
      supabase,
      backup.items.map((item) => item.id),
    );
    const items = backup.items.map((item) =>
      planRollback(rows.get(item.id), item),
    );
    items.forEach(print);
    const restore = items.filter((item) => item.action === "restore");
    console.log(`restore: ${restore.length} / ${items.length}`);
    if (!apply) return console.log("dry-run: nothing written");
    return writeAll(supabase, restore, "before");
  }

  const rows = await fetchRows(
    supabase,
    SUMMARY_TEXT_FIXES.map((fix) => fix.id),
  );
  const items = SUMMARY_TEXT_FIXES.map((fix) =>
    planTextFix(rows.get(fix.id), fix),
  );
  items.forEach(print);
  const updates = items.filter((item) => item.action === "update");
  console.log(`to update: ${updates.length} / ${items.length}`);
  if (!apply) return console.log("dry-run: nothing written");
  if (!updates.length) return console.log("nothing to write");

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(RESULTS_DIR, `repair-summary-sentences-${stamp}.json`);
  await fs.writeFile(
    file,
    JSON.stringify(
      { createdAt: new Date().toISOString(), items: updates },
      null,
      2,
    ),
  );
  console.log(`backup: ${file}`);
  await writeAll(supabase, updates, "after");
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
