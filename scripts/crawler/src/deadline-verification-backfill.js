#!/usr/bin/env node
/**
 * Fills the deadline verification columns of 20261110010000 for existing
 * posters (docs/design/v6.1 SPEC 4.7, decision A-1 of 2026-11-10).
 *
 * Steps, each dry-run unless --apply --confirm=DEADLINE_VERIFICATION_BACKFILL:
 *   --step=1  new columns only. Safe with the code running today.
 *   --step=2  deadline values a person found wrong in the source (overrides.correct).
 *   --step=3  deadline_type for per-session and recurring posters. Run with the
 *             v6.1 release: today's code reads per_session as "일정 확인 필요".
 *   --rollback=<file>  restores a backup this script wrote.
 *
 * Rules, after the person-checked overrides:
 *   - fixed with a stored date: the date is kept as confirmed (source legacy),
 *     the time is not; unless the date equals the event start or end date, which
 *     is how a course date got stored as the deadline (SPEC 4.7) -> unverified.
 *   - reception_verified (0단계 C-9): false only for ongoing/unknown posters whose
 *     event already ended, and for posters with no dates at all.
 */
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { DEADLINE_VERIFICATION_OVERRIDES } from "./deadline-verification-overrides-20261110.js";

export const APPLY_CONFIRM = "DEADLINE_VERIFICATION_BACKFILL";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(
  path.resolve(__dirname, "../../.."),
  "data",
  "results",
);

const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-11-19" in Asia/Seoul, or null. */
export function toSeoulDate(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : seoulDate.format(new Date(time));
}

export const STEP1_COLUMNS = [
  "deadline_status",
  "deadline_time_verified",
  "deadline_source",
  "reception_verified",
  "session_rule_text",
  "session_rule_verified",
  "last_session_deadline_date",
  "deadline_label",
  "deadline_note",
  "selection_notice_at",
];

const DEFAULTS = {
  deadline_status: "unverified",
  deadline_time_verified: false,
  deadline_source: null,
  reception_verified: false,
  session_rule_text: null,
  session_rule_verified: false,
  last_session_deadline_date: null,
  deadline_label: null,
  deadline_note: null,
  selection_notice_at: null,
};

/** 0단계 C-9 as decided: only clear signs of "not open" make it false. */
export function receptionVerifiedByRule(row, today) {
  const noDates = !row.start_at && !row.end_at && !row.ev_start && !row.ev_end;
  if (noDates) return false;
  const eventEnd = toSeoulDate(row.ev_end);
  if (
    ["ongoing", "unknown"].includes(row.deadline_type) &&
    eventEnd &&
    eventEnd < today
  )
    return false;
  return true;
}

/**
 * A-1 keeps the dates of posters that existed when it was decided. A poster
 * collected later gets its status from where the crawler read the date
 * (portal field: date confirmed; text or summary: unverified), not from here.
 */
export const LEGACY_CUTOFF = "2026-11-10T00:00:00+09:00";

/** Step-1 values for one poster by rule (no override). */
export function step1ByRule(row, today) {
  const values = {
    ...DEFAULTS,
    reception_verified: receptionVerifiedByRule(row, today),
  };
  if (row.deadline_type !== "fixed" || !row.end_at)
    return { values, rule: "no-fixed-date" };
  if (row.created_at && Date.parse(row.created_at) >= Date.parse(LEGACY_CUTOFF))
    return { values, rule: "after-cutoff-unverified" };
  const end = toSeoulDate(row.end_at);
  if (end === toSeoulDate(row.ev_start) || end === toSeoulDate(row.ev_end))
    return { values, rule: "auto-unverified-event-date" };
  return {
    values: {
      ...values,
      deadline_status: "verified",
      deadline_source: "legacy",
    },
    rule: "legacy-date",
  };
}

/** Plan for every row; overrides win field by field over the rule. */
export function planBackfill(rows, overrides, today) {
  const byId = new Map(overrides.map((item) => [item.id, item]));
  return rows.map((row) => {
    const { values, rule } = step1ByRule(row, today);
    const override = byId.get(row.id);
    const step1 = { ...values };
    if (override)
      for (const column of STEP1_COLUMNS)
        if (override[column] !== undefined) step1[column] = override[column];
    // A person-checked poster is confirmed to be taking applications unless said otherwise.
    if (override && override.reception_verified === undefined)
      step1.reception_verified = true;
    // A stored value the source contradicts is not marked confirmed before it is
    // corrected: the confirmation travels with the correction in step 2.
    let step2 = override?.correct ?? null;
    if (step2) {
      step2 = {
        ...step2,
        deadline_status: step1.deadline_status,
        deadline_time_verified: step1.deadline_time_verified,
        deadline_source: step1.deadline_source,
      };
      step1.deadline_status = "unverified";
      step1.deadline_time_verified = false;
      step1.deadline_source = null;
    }
    return {
      id: row.id,
      title: row.title,
      rule: override ? "override" : rule,
      why: override?.why ?? null,
      step1,
      step2,
      step3: override?.release_type
        ? { deadline_type: override.release_type }
        : null,
    };
  });
}

/** What the poster will look like to the screen after the chosen steps. */
export function presentationInput(row, plan, steps, now) {
  const after = { ...row };
  if (steps.includes(2) && plan.step2) {
    if (plan.step2.application_end_at)
      after.end_at = plan.step2.application_end_at;
    if (plan.step2.event_start_at) after.ev_start = plan.step2.event_start_at;
    if (plan.step2.event_end_at) after.ev_end = plan.step2.event_end_at;
  }
  const type =
    steps.includes(3) && plan.step3
      ? plan.step3.deadline_type
      : row.deadline_type;
  const s = {
    ...plan.step1,
    ...(steps.includes(2) && plan.step2 ? plan.step2 : {}),
  };
  return {
    deadlineType: type,
    applicationStartAt: row.start_at,
    applicationEndAt: after.end_at,
    eventEndAt: after.ev_end,
    posterStatus: row.poster_status,
    deadlineStatus: s.deadline_status,
    deadlineTimeVerified: s.deadline_time_verified,
    receptionVerified: s.reception_verified,
    sessionRuleText: s.session_rule_text,
    sessionRuleVerified: s.session_rule_verified,
    lastSessionDeadlineDate: s.last_session_deadline_date,
    deadlineLabel: s.deadline_label,
    deadlineNote: s.deadline_note,
    now,
  };
}

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
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { "X-Client-Info": "posterlink-deadline-verification-backfill" },
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  });
}

const READ_COLUMNS = [
  "id",
  "title",
  "poster_status",
  "deadline_type",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "created_at",
  "updated_at",
  "deadline_checked_at",
  ...STEP1_COLUMNS,
].join(",");

/**
 * Step 1 fills a row once (deadline_checked_at is still empty), so a rerun —
 * daily for rows the crawler adds before it sets these columns itself — never
 * overwrites what an operator corrected later.
 */
export function step1Targets(plans, rowsById) {
  return plans.filter((plan) => !rowsById.get(plan.id)?.deadline_checked_at);
}

/** Columns that exist before 20261110010000 is applied. */
const PRE_MIGRATION_COLUMNS = [
  "id",
  "title",
  "poster_status",
  "deadline_type",
  "application_start_at",
  "application_end_at",
  "event_start_at",
  "event_end_at",
  "created_at",
  "updated_at",
].join(",");
const CORRECTABLE = ["application_end_at", "event_start_at", "event_end_at"];

/**
 * Step 2 before the migration (--existing-columns-only): only the deadline and
 * event values are written; the confirmation travels with step 1 later.
 * Rows that already hold the corrected values are left out.
 */
export function existingColumnsPatch(plan, row) {
  if (!plan.step2) return null;
  const patch = Object.fromEntries(
    CORRECTABLE.filter((key) => plan.step2[key] !== undefined).map((key) => [
      key,
      plan.step2[key],
    ]),
  );
  const same = Object.entries(patch).every(
    ([key, value]) => row[key] && Date.parse(row[key]) === Date.parse(value),
  );
  return Object.keys(patch).length && !same ? patch : null;
}

async function fetchRows(supabase, columns = READ_COLUMNS) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("posters")
      .select(columns)
      .in("poster_status", ["published", "review"])
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows.map((row) => ({
    ...row,
    start_at: row.application_start_at,
    end_at: row.application_end_at,
    ev_start: row.event_start_at,
    ev_end: row.event_end_at,
  }));
}

function fullPatchFor(plan, step) {
  if (step === 1)
    return { ...plan.step1, deadline_checked_at: new Date().toISOString() };
  if (step === 2) return plan.step2;
  return plan.step3;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  if (apply && args.confirm !== APPLY_CONFIRM)
    throw new Error(`--apply needs --confirm=${APPLY_CONFIRM}`);
  const supabase = createSupabase();

  if (args.rollback) {
    const backup = JSON.parse(await fs.readFile(args.rollback, "utf8"));
    console.log(`rollback ${backup.items.length} rows of step ${backup.step}`);
    if (!apply) return console.log("dry-run: nothing written");
    let failed = 0;
    for (const item of backup.items) {
      const { data, error } = await supabase
        .from("posters")
        .update(item.before)
        .eq("id", item.id)
        .eq("updated_at", item.updatedAtAfter)
        .select("id");
      if (error || !data?.length) {
        failed += 1;
        console.log(
          `  ${item.id.slice(0, 8)} not restored: ${error?.message ?? "changed since"}`,
        );
      }
    }
    console.log(
      `restored ${backup.items.length - failed} / ${backup.items.length}`,
    );
    if (failed) process.exitCode = 1;
    return;
  }

  const step = Number(args.step);
  if (![1, 2, 3].includes(step)) throw new Error("--step=1|2|3 is required");
  const preMigration = Boolean(args["existing-columns-only"]);
  if (preMigration && step !== 2)
    throw new Error("--existing-columns-only works with --step=2 only");
  const today = toSeoulDate(new Date().toISOString());
  const rows = await fetchRows(
    supabase,
    preMigration ? PRE_MIGRATION_COLUMNS : READ_COLUMNS,
  );
  const plans = planBackfill(rows, DEADLINE_VERIFICATION_OVERRIDES, today);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = DEADLINE_VERIFICATION_OVERRIDES.filter(
    (item) => !byId.has(item.id),
  );
  const patchFor = preMigration
    ? (plan) => existingColumnsPatch(plan, byId.get(plan.id))
    : (plan, s) => fullPatchFor(plan, s);
  const targets = (step === 1 ? step1Targets(plans, byId) : plans).filter(
    (plan) => patchFor(plan, step),
  );
  const rules = {};
  for (const plan of targets) rules[plan.rule] = (rules[plan.rule] ?? 0) + 1;
  console.log(`step ${step}: ${targets.length} rows`, rules);
  if (missing.length)
    console.log(
      `overrides not published/review now: ${missing.map((m) => m.id.slice(0, 8)).join(", ")}`,
    );
  if (step !== 1)
    for (const plan of targets)
      console.log(
        `  ${plan.id.slice(0, 8)} ${JSON.stringify(patchFor(plan, step))}  ${plan.title}`,
      );
  if (!apply) return console.log("dry-run: nothing written");

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const file = path.join(
    RESULTS_DIR,
    `deadline-verification-step${step}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const items = targets.map((plan) => {
    const patch = patchFor(plan, step);
    const row = byId.get(plan.id);
    return {
      id: plan.id,
      before: Object.fromEntries(
        Object.keys(patch).map((key) => [key, row[key] ?? null]),
      ),
      patch,
      updatedAt: row.updated_at,
    };
  });
  await fs.writeFile(
    file,
    JSON.stringify(
      { step, createdAt: new Date().toISOString(), items },
      null,
      2,
    ),
  );
  console.log(`backup: ${file}`);
  let failed = 0;
  for (const item of items) {
    const updatedAtAfter = new Date().toISOString();
    const { data, error } = await supabase
      .from("posters")
      .update({ ...item.patch, updated_at: updatedAtAfter })
      .eq("id", item.id)
      .eq("updated_at", item.updatedAt)
      .select("id");
    if (error || !data?.length) {
      failed += 1;
      console.log(
        `  ${item.id.slice(0, 8)} not written: ${error?.message ?? "changed since read"}`,
      );
    } else item.updatedAtAfter = updatedAtAfter;
  }
  await fs.writeFile(
    file,
    JSON.stringify(
      { step, createdAt: new Date().toISOString(), items },
      null,
      2,
    ),
  );
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
