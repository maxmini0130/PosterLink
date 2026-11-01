import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { retentionDb } from "./retentionTestDb";

// Runs scripts/retention/pre-merge-readonly-check.sql against the stage 0
// migrations in PGlite: everything must check out on a faithful database, and
// each kind of drift the check exists to catch must show up as a failed row.
const checkSql = readFileSync(
  "scripts/retention/pre-merge-readonly-check.sql",
  "utf8",
);

type Check = { section: string; item: string; ok: boolean };

async function seeded() {
  const db = await retentionDb();
  await db.exec(`
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobid bigint PRIMARY KEY, jobname text, schedule text, command text, active boolean);
    CREATE TABLE cron.job_run_details (runid bigint, jobid bigint, status text,
      start_time timestamptz, end_time timestamptz, return_message text);
    INSERT INTO cron.job VALUES (7, 'usage-log-retention-daily', '30 18 * * *',
      ' select * from public.run_usage_log_retention(50000); ', true);
    -- One visit a week for twelve weeks, then the daily run.
    INSERT INTO site_visit_logs (visitor_key, path, created_at)
      SELECT 'visitor-' || n, '/', now() - (n * interval '7 days') FROM generate_series(1, 12) n;
    SELECT * FROM run_usage_log_retention(50000);
    INSERT INTO cron.job_run_details VALUES (1, 7, 'succeeded', now(), now(), '1 row');
  `);
  return db;
}

/** Failed rows of the verdict query, after an optional change made in the same transaction. */
async function failures(db: PGlite, change = "") {
  // The script's own ROLLBACK also undoes the change, so each case starts clean.
  const results = await db.exec(`BEGIN; ${change}; ${checkSql}`);
  const verdict = results.find((r) =>
    r.fields.some((f) => f.name === "section"),
  );
  assert.ok(verdict, "verdict query ran");
  const rows = verdict.rows as Check[];
  assert.ok(rows.length > 40, "all checks listed");
  return rows
    .filter((row) => !row.ok)
    .map((row) => `${row.section}: ${row.item}`);
}

test("a database built from the migrations passes every check", async () => {
  const db = await seeded();
  assert.deepEqual(await failures(db), []);
});

test("drift in indexes, constraints, function settings and rights is reported", async () => {
  const db = await seeded();
  assert.deepEqual(
    await failures(db, "DROP INDEX product_events_signup_complete_once"),
    ["index: product_events_signup_complete_once"],
  );
  assert.deepEqual(
    await failures(
      db,
      `ALTER TABLE product_events DROP CONSTRAINT product_events_client_check,
         ADD CONSTRAINT product_events_client_check CHECK (true)`,
    ),
    ["constraint: product_events.product_events_client_check"],
  );
  assert.deepEqual(
    await failures(
      db,
      "ALTER FUNCTION record_product_event(text, text, text, text, uuid, uuid, jsonb) RESET search_path",
    ),
    ["function: record_product_event(text,text,text,text,uuid,uuid,jsonb)"],
  );
  assert.deepEqual(
    await failures(
      db,
      `ALTER TABLE visitor_identity_links DROP CONSTRAINT visitor_identity_links_user_id_fkey,
         ADD CONSTRAINT visitor_identity_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL`,
    ),
    ["constraint: visitor_identity_links.visitor_identity_links_user_id_fkey"],
  );
  assert.deepEqual(
    await failures(
      db,
      "GRANT SELECT ON usage_log_retention_state TO service_role",
    ),
    ["table right: public.usage_log_retention_state / service_role"],
  );
  assert.deepEqual(await failures(db, "UPDATE cron.job SET active = false"), [
    "job: usage-log-retention-daily",
  ]);
});

test("a missing recent week, no stored weeks or no successful run is reported", async () => {
  const db = await seeded();
  const last = (
    await db.query<{ w: string }>(
      "SELECT max(cohort_week)::text AS w FROM usage_weekly_cohorts",
    )
  ).rows[0].w;
  assert.ok(last, "the run stored weeks");
  assert.deepEqual(
    await failures(
      db,
      `DELETE FROM usage_weekly_cohorts WHERE cohort_week = '${last}'`,
    ),
    [
      "cohort: every closed week stored up to the last run",
      `cohort: missing week ${last}`,
    ],
  );
  const empty = await failures(db, "DELETE FROM usage_weekly_cohorts");
  assert.ok(
    empty.includes("cohort: every closed week stored up to the last run"),
  );
  assert.ok(empty.some((item) => item.startsWith("cohort: missing week ")));
  assert.deepEqual(
    (
      await failures(db, "UPDATE cron.job_run_details SET status = 'failed'")
    ).sort(),
    [
      "cohort: a successful run exists",
      "cohort: every closed week stored up to the last run",
    ],
  );
});
