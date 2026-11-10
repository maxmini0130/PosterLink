#!/usr/bin/env node
/**
 * Moves deadlines known only by their date to 23:59:59 Asia/Seoul. Stored as
 * UTC midnight (09:00 KST) or 00:00 KST they close the poster on its last day.
 *
 * Dry-run unless --apply --confirm=REPAIR_DATE_ONLY_DEADLINES is given.
 *
 *   --manifest          the source-checked list (date-only-deadline-manifest-*)
 *   --daily             new 09:00 rows whose stored text has no time, until the
 *                       crawler fix is live. Apply needs --expected-count=N,
 *                       the number shown by the dry-run.
 *   --rollback=<file>   restores the values in a backup this script wrote
 *
 * Every write is compare-and-set on the value that was read, and the backup is
 * written before the first update.
 */
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  DATE_ONLY_REPAIR_CHANGES,
  DATE_ONLY_REPAIR_KEEP,
} from "./date-only-deadline-manifest-20261110.js";

export const APPLY_CONFIRM = "REPAIR_DATE_ONLY_DEADLINES";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const RESULTS_DIR = path.join(REPO_ROOT, "data", "results");
const REQUEST_TIMEOUT_MS = 30_000;

const seoulFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-19 09:00:00" in Asia/Seoul. */
export function toSeoulText(value) {
  return seoulFormatter.format(new Date(value));
}

export function endOfSeoulDay(date) {
  return `${date}T23:59:59+09:00`;
}

const TIME_HINT =
  /\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시(?![간설행민청범작기도군구각])|오전|오후|자정|정오/u;

export function hasStoredTimeHint(row) {
  return TIME_HINT.test(
    [row.title, row.summary_short, row.summary_long, row.application_method]
      .filter(Boolean)
      .join(" "),
  );
}

/** Only rows still holding the value that was checked against the source. */
export function planManifest(rows, changes) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return changes.map((change) => {
    const row = byId.get(change.id);
    const base = { id: change.id, title: change.title, source: change.source };
    if (!row) return { ...base, action: "missing" };
    const current = toSeoulText(row.application_end_at);
    // A time stated in the source (change.time) wins over the end of the day.
    const time = change.time ?? "23:59:59";
    const next = `${change.date}T${time}+09:00`;
    if (current === `${change.date} ${time}`)
      return { ...base, action: "already", current };
    if (current !== change.expected)
      return { ...base, action: "changed-since-check", current };
    return {
      ...base,
      action: "update",
      current,
      prev: row.application_end_at,
      next,
    };
  });
}

/** New 09:00 rows on or after today, minus the kept ones and any time mention. */
export function planDaily(rows, keepIds, today) {
  const update = [];
  const skipped = [];
  for (const row of rows) {
    if (!row.application_end_at || keepIds.has(row.id)) continue;
    const current = toSeoulText(row.application_end_at);
    const [date, time] = current.split(" ");
    if (time !== "09:00:00" || date < today) continue;
    const base = { id: row.id, title: row.title, current };
    if (hasStoredTimeHint(row)) skipped.push({ ...base, action: "time-hint" });
    else
      update.push({
        ...base,
        action: "update",
        source: "저장 본문에 시각 표기 없음(원문 대조 안 함)",
        prev: row.application_end_at,
        next: endOfSeoulDay(date),
      });
  }
  return { update, skipped };
}

export function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

export function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { "X-Client-Info": "posterlink-repair-date-only-deadlines" },
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
    },
  });
}

const COLUMNS =
  "id,title,poster_status,application_end_at,summary_short,summary_long,application_method";

async function fetchByIds(supabase, ids) {
  const { data, error } = await supabase
    .from("posters")
    .select(COLUMNS)
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

async function fetchUpcoming(supabase, today) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("posters")
      .select(COLUMNS)
      .in("poster_status", ["published", "review"])
      .gte("application_end_at", `${today}T00:00:00+09:00`)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

function printPlan(items) {
  for (const item of items) {
    const after = item.next ? ` -> ${toSeoulText(item.next)}` : "";
    console.log(
      `${item.action.padEnd(20)} ${item.id.slice(0, 8)} ${item.current ?? "-"}${after}  ${item.title ?? ""}`,
    );
  }
}

async function writeBackup(mode, items) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(
    RESULTS_DIR,
    `repair-date-only-deadlines-${mode}-${stamp}.json`,
  );
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        mode,
        createdAt: new Date().toISOString(),
        items: items.map(({ id, title, source, prev, next }) => ({
          id,
          title,
          source,
          prev,
          next,
        })),
      },
      null,
      2,
    ),
  );
  return file;
}

/** Compare-and-set; a row that changed since the read is left alone. */
async function writeAll(supabase, items, from, to) {
  let written = 0;
  const notWritten = [];
  for (const item of items) {
    const { data, error } = await supabase
      .from("posters")
      .update({ application_end_at: item[to] })
      .eq("id", item.id)
      .eq("application_end_at", item[from])
      .select("id");
    if (error) {
      notWritten.push({ id: item.id, reason: error.message });
    } else if (!data?.length) {
      notWritten.push({ id: item.id, reason: "value changed since read" });
    } else {
      written += 1;
    }
  }
  return { written, notWritten };
}

function report(result) {
  console.log(
    `written: ${result.written}, not written: ${result.notWritten.length}`,
  );
  for (const item of result.notWritten)
    console.log(`  ${item.id.slice(0, 8)} ${item.reason}`);
  if (result.notWritten.length) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modes = ["manifest", "daily", "rollback"].filter((key) => args[key]);
  if (modes.length !== 1)
    throw new Error(
      "Choose exactly one of --manifest, --daily, --rollback=<file>",
    );
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== APPLY_CONFIRM)
    throw new Error(`--apply needs --confirm=${APPLY_CONFIRM}`);

  const supabase = createSupabase();

  if (args.rollback) {
    const backup = JSON.parse(await fs.readFile(args.rollback, "utf8"));
    const rows = await fetchByIds(
      supabase,
      backup.items.map((item) => item.id),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = backup.items.map((item) => {
      const current = byId.get(item.id)?.application_end_at;
      return {
        ...item,
        // The exact stored text for the compare-and-set.
        next: current,
        action:
          current && Date.parse(current) === Date.parse(item.next)
            ? "restore"
            : "changed-since-repair",
        current: current ? toSeoulText(current) : null,
      };
    });
    const restore = items.filter((item) => item.action === "restore");
    for (const item of items)
      console.log(
        `${item.action.padEnd(20)} ${item.id.slice(0, 8)} ${item.current ?? "-"} -> ${toSeoulText(item.prev)}  ${item.title ?? ""}`,
      );
    console.log(`restore: ${restore.length} / ${items.length}`);
    if (!apply) return console.log("dry-run: nothing written");
    return report(await writeAll(supabase, restore, "next", "prev"));
  }

  const today = toSeoulText(new Date()).slice(0, 10);
  let items;
  if (args.manifest) {
    const rows = await fetchByIds(
      supabase,
      DATE_ONLY_REPAIR_CHANGES.map((change) => change.id),
    );
    items = planManifest(rows, DATE_ONLY_REPAIR_CHANGES);
    printPlan(items);
  } else {
    const keep = new Set(DATE_ONLY_REPAIR_KEEP.map((row) => row.id));
    const { update, skipped } = planDaily(
      await fetchUpcoming(supabase, today),
      keep,
      today,
    );
    printPlan(update);
    console.log(
      `skipped because stored text mentions a time: ${skipped.length}`,
    );
    printPlan(skipped);
    items = update;
    if (apply && Number(args["expected-count"]) !== update.length)
      throw new Error(
        `--expected-count must equal the ${update.length} rows listed; review the list first`,
      );
  }

  const updates = items.filter((item) => item.action === "update");
  console.log(`to update: ${updates.length} / ${items.length}`);
  if (!apply) return console.log("dry-run: nothing written");
  if (!updates.length) return console.log("nothing to write");

  const backup = await writeBackup(
    args.manifest ? "manifest" : "daily",
    updates,
  );
  console.log(`backup: ${backup}`);
  report(await writeAll(supabase, updates, "prev", "next"));
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
