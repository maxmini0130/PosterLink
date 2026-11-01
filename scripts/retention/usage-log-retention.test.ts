import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8").replace(
    /NOTIFY pgrst[^;]*;/g,
    "",
  );

const USER = "11111111-1111-4111-8111-111111111111";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
    CREATE TABLE posters (id uuid PRIMARY KEY, poster_status text);
    CREATE TABLE poster_links (id uuid PRIMARY KEY);
    CREATE TABLE institutions (id uuid PRIMARY KEY);
    CREATE TABLE search_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      query text NOT NULL, result_count int DEFAULT 0, created_at timestamptz DEFAULT now());
    SET check_function_bodies = off;
    -- Supabase grants new public tables and functions to the API roles by default.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(
    read("20260718000000_add_site_visit_logs.sql").split(
      "CREATE OR REPLACE FUNCTION",
    )[0],
  );
  await db.exec(
    `ALTER TABLE site_visit_logs ADD COLUMN actor_type text NOT NULL DEFAULT 'visitor', ADD COLUMN is_automated boolean NOT NULL DEFAULT false;`,
  );
  await db.exec(read("20260503000000_add_poster_view_logs.sql"));
  await db.exec(read("20260502010000_add_poster_link_click_logs.sql"));
  await db.exec(read("20260924020000_add_alert_cta_rpc_and_events.sql"));
  await db.exec(read("20261031010000_extend_product_events_for_retention.sql"));
  await db.exec(read("20261031020000_add_usage_log_retention.sql"));
  await db.exec(`INSERT INTO profiles (id) VALUES ('${USER}');`);
  return db;
}

const count = async (db: PGlite, sql: string) =>
  Number((await db.query<{ n: number }>(sql)).rows[0].n);

/** Rows one minute either side of the cutoffs, in every target table. */
async function boundaryFixture(db: PGlite) {
  await db.exec(`
    CREATE TEMP TABLE t AS SELECT * FROM usage_log_retention_cutoffs();
    INSERT INTO site_visit_logs (visitor_key, path, query_string, referrer_url, created_at)
      SELECT 'old-visit-key', '/', 'q=x', 'https://a.example/?q=x', raw_cutoff - interval '1 minute' FROM t
      UNION ALL SELECT 'keep-visit-key', '/', 'q=x', 'https://a.example/?q=x', raw_cutoff + interval '1 minute' FROM t
      UNION ALL SELECT 'keep-visit-key', '/', 'q=y', NULL, search_cutoff + interval '1 minute' FROM t;
    INSERT INTO poster_view_logs (visitor_key, created_at)
      SELECT 'k', raw_cutoff - interval '1 minute' FROM t
      UNION ALL SELECT 'k', raw_cutoff + interval '1 minute' FROM t;
    INSERT INTO poster_link_click_logs (link_url, created_at)
      SELECT 'https://a.example', raw_cutoff - interval '1 minute' FROM t
      UNION ALL SELECT 'https://a.example', raw_cutoff + interval '1 minute' FROM t;
    INSERT INTO product_events (event_name, visitor_key, client, created_at)
      SELECT 'share_click', 'old-event-key', 'web', raw_cutoff - interval '1 minute' FROM t
      UNION ALL SELECT 'share_click', 'event-key', 'web', raw_cutoff + interval '1 minute' FROM t;
    INSERT INTO search_logs (query, created_at)
      SELECT 'old', search_cutoff - interval '1 minute' FROM t
      UNION ALL SELECT 'new', search_cutoff + interval '1 minute' FROM t;
    INSERT INTO visitor_identity_links (visitor_key, user_id, client, first_linked_at, last_linked_at)
      SELECT 'old-visit-key', '${USER}'::uuid, 'web', raw_cutoff - interval '1 day', raw_cutoff - interval '1 day' FROM t
      UNION ALL SELECT 'keep-visit-key', '${USER}', 'web', raw_cutoff - interval '1 day', raw_cutoff - interval '1 day' FROM t
      UNION ALL SELECT 'event-key', '${USER}', 'web', raw_cutoff - interval '1 day', raw_cutoff - interval '1 day' FROM t
      UNION ALL SELECT 'recent-link-key', '${USER}', 'web', now(), now() FROM t;
  `);
}

test("cutoffs use calendar months in Asia/Seoul and 30 days for search text", async () => {
  const db = await setup();
  const { rows } = await db.query<{ raw_ok: boolean; search_ok: boolean }>(`
    SELECT
      raw_cutoff = ((now() AT TIME ZONE 'Asia/Seoul') - interval '3 months') AT TIME ZONE 'Asia/Seoul' AS raw_ok,
      search_cutoff = now() - interval '30 days' AS search_ok
    FROM usage_log_retention_cutoffs()`);
  assert.deepEqual(rows[0], { raw_ok: true, search_ok: true });
});

test("preview reports what a run would touch and deletes nothing", async () => {
  const db = await setup();
  await boundaryFixture(db);
  const preview = (
    await db.query<{ target: string; action: string; rows: number | null }>(
      "SELECT target, action, rows FROM usage_log_retention_preview()",
    )
  ).rows.map((r) => [
    r.target,
    r.action,
    r.rows === null ? null : Number(r.rows),
  ]);
  assert.deepEqual(preview, [
    ["site_visit_logs", "delete", 1],
    ["site_visit_logs", "clear query_string/referrer_url", 1],
    ["poster_view_logs", "delete", 1],
    ["poster_link_click_logs", "delete", 1],
    ["product_events", "delete", 1],
    ["search_logs", "delete", 1],
    ["visitor_identity_links", "delete", 1],
    ["usage_weekly_cohorts", "snapshot (weeks not stored yet)", null],
  ]);
  assert.equal(await count(db, "SELECT count(*) AS n FROM site_visit_logs"), 3);
  assert.equal(
    await count(db, "SELECT count(*) AS n FROM visitor_identity_links"),
    4,
  );
});

test("a run deletes only rows past the cutoffs and clears old search text", async () => {
  const db = await setup();
  await boundaryFixture(db);
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  for (const table of [
    "poster_view_logs",
    "poster_link_click_logs",
    "product_events",
    "search_logs",
  ])
    assert.equal(
      await count(db, `SELECT count(*) AS n FROM ${table}`),
      1,
      table,
    );
  const visits = (
    await db.query<{
      visitor_key: string;
      query_string: string | null;
      referrer_url: string | null;
    }>(
      "SELECT visitor_key, query_string, referrer_url FROM site_visit_logs ORDER BY created_at",
    )
  ).rows;
  assert.deepEqual(visits, [
    { visitor_key: "keep-visit-key", query_string: null, referrer_url: null },
    { visitor_key: "keep-visit-key", query_string: "q=y", referrer_url: null },
  ]);
  // Links survive while their key still has visits or events in the window.
  const links = (
    await db.query<{ visitor_key: string }>(
      "SELECT visitor_key FROM visitor_identity_links ORDER BY visitor_key",
    )
  ).rows.map((r) => r.visitor_key);
  assert.deepEqual(links, ["event-key", "keep-visit-key", "recent-link-key"]);
  // A second run has nothing left to do.
  const again = (
    await db.query<{ action: string; rows: number }>(
      "SELECT action, rows FROM run_usage_log_retention(50000) WHERE action <> 'snapshot'",
    )
  ).rows;
  assert(again.every((r) => Number(r.rows) === 0));
});

test("each step stops at the batch size and the backlog drains over runs", async () => {
  const db = await setup();
  await db.exec(`
    INSERT INTO poster_view_logs (visitor_key, created_at)
    SELECT 'k', now() - interval '1 year' FROM generate_series(1, 5);
  `);
  await db.query("SELECT * FROM run_usage_log_retention(2)");
  assert.equal(
    await count(db, "SELECT count(*) AS n FROM poster_view_logs"),
    3,
  );
  await db.query("SELECT * FROM run_usage_log_retention(2)");
  await db.query("SELECT * FROM run_usage_log_retention(2)");
  assert.equal(
    await count(db, "SELECT count(*) AS n FROM poster_view_logs"),
    0,
  );
  await assert.rejects(
    db.query("SELECT * FROM run_usage_log_retention(0)"),
    /invalid batch size/,
  );
});

test("API roles cannot run the purge; only service_role may read the cohorts", async () => {
  const db = await setup();
  const { rows } = await db.query<Record<string, boolean>>(`
    SELECT
      bool_or(has_function_privilege(r, 'run_usage_log_retention(integer)', 'EXECUTE')) AS run,
      bool_or(has_function_privilege(r, 'usage_log_retention_preview()', 'EXECUTE')) AS preview,
      bool_or(has_function_privilege(r, 'snapshot_usage_weekly_cohorts()', 'EXECUTE')) AS snapshot,
      bool_or(has_function_privilege(r, 'usage_log_retention_cutoffs()', 'EXECUTE')) AS cutoffs,
      bool_or(has_table_privilege(r, 'usage_weekly_cohorts', 'INSERT, UPDATE, DELETE, TRUNCATE')) AS write_cohorts,
      bool_or(has_table_privilege(r, 'usage_weekly_cohorts', 'SELECT')) FILTER (WHERE r <> 'service_role') AS client_read,
      bool_or(has_table_privilege(r, 'usage_weekly_cohorts', 'SELECT')) FILTER (WHERE r = 'service_role') AS server_read
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r`);
  assert.deepEqual(rows[0], {
    run: false,
    preview: false,
    snapshot: false,
    cutoffs: false,
    write_cohorts: false,
    client_read: false,
    server_read: true,
  });
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE anon");
      await tx.query("SELECT * FROM run_usage_log_retention(1)");
    }),
    /permission denied/,
  );
});

/** Cohort week W starts 60+ days ago, so it is finished and still in raw logs. */
async function cohortFixture(db: PGlite) {
  await db.exec(`
    CREATE TEMP TABLE w AS SELECT
      date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')::date - 60)::date AS week,
      ((date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')::date - 60)::date + time '10:00') AT TIME ZONE 'Asia/Seoul') AS t0;
    INSERT INTO site_visit_logs (visitor_key, path, created_at, actor_type, is_automated)
      SELECT 'p0', '/', t0 - interval '100 days', 'visitor', false FROM w      -- data start
      UNION ALL SELECT 'p1', '/', t0, 'visitor', false FROM w                     -- back next day
      UNION ALL SELECT 'p1', '/', t0 + interval '1 day', 'visitor', false FROM w
      UNION ALL SELECT 'p2', '/', t0, 'visitor', false FROM w                     -- back on day 10
      UNION ALL SELECT 'p2', '/', t0 + interval '10 days', 'visitor', false FROM w
      UNION ALL SELECT 'p3', '/', t0, 'visitor', false FROM w                     -- never back
      UNION ALL SELECT 'p4', '/', t0 - interval '50 days', 'visitor', false FROM w -- 50-day gap: new again
      UNION ALL SELECT 'p4', '/', t0, 'visitor', false FROM w
      UNION ALL SELECT 'p5', '/', t0 - interval '20 days', 'visitor', false FROM w -- 20-day gap: not new
      UNION ALL SELECT 'p5', '/', t0, 'visitor', false FROM w
      UNION ALL SELECT 'p6', '/', t0, 'bot', true FROM w                          -- excluded
      UNION ALL SELECT 'p7', '/', t0, 'visitor', false FROM w                     -- same KST day only
      UNION ALL SELECT 'p7', '/', t0 + interval '2 hours', 'visitor', false FROM w
      UNION ALL SELECT 'p8', '/', now() - interval '3 days', 'visitor', false FROM w; -- unfinished cohort
  `);
}

const cohortRow = async (db: PGlite) =>
  (
    await db.query<Record<string, unknown>>(`
      SELECT new_people, returned_7d, returned_30d, active_people, lookback_complete
      FROM usage_weekly_cohorts WHERE cohort_week = (SELECT week FROM w)`)
  ).rows[0];

test("snapshot stores finished weekly cohorts as counts only", async () => {
  const db = await setup();
  await cohortFixture(db);
  await db.query("SELECT snapshot_usage_weekly_cohorts()");
  assert.deepEqual(await cohortRow(db), {
    new_people: 5, // p1 p2 p3 p4 p7
    returned_7d: 1, // p1
    returned_30d: 2, // p1 p2
    active_people: 6, // + p5
    lookback_complete: true,
  });
  // The data-start week cannot tell new from returning people.
  const first = (
    await db.query<{ lookback_complete: boolean }>(
      "SELECT lookback_complete FROM usage_weekly_cohorts ORDER BY cohort_week LIMIT 1",
    )
  ).rows[0];
  assert.equal(first.lookback_complete, false);
  // The cohort from 3 days ago is not finished yet.
  assert.equal(
    await count(
      db,
      "SELECT count(*) AS n FROM usage_weekly_cohorts WHERE cohort_week > (now() AT TIME ZONE 'Asia/Seoul')::date - 30",
    ),
    0,
  );
  const columns = (
    await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'usage_weekly_cohorts' ORDER BY 1",
    )
  ).rows.map((r) => r.column_name);
  assert.deepEqual(columns, [
    "active_people",
    "cohort_week",
    "computed_at",
    "lookback_complete",
    "new_people",
    "returned_30d",
    "returned_7d",
  ]);
});

test("a run snapshots before purging, and later runs never rewrite stored weeks", async () => {
  const db = await setup();
  await cohortFixture(db);
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  // p0 (100 days before W) was purged in the same run, after its week was stored.
  assert.equal(
    await count(
      db,
      "SELECT count(*) AS n FROM site_visit_logs WHERE visitor_key = 'p0'",
    ),
    0,
  );
  assert.equal(
    await count(
      db,
      `SELECT new_people AS n FROM usage_weekly_cohorts
       WHERE cohort_week = date_trunc('week', ((SELECT t0 FROM w) - interval '100 days') AT TIME ZONE 'Asia/Seoul')::date`,
    ),
    1,
  );
  const before = await cohortRow(db);
  await db.exec(
    "DELETE FROM site_visit_logs WHERE visitor_key IN ('p1', 'p2')",
  );
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.deepEqual(await cohortRow(db), before);
});

/**
 * Codex review (0e191b6): a week visited only by a returning person has no new
 * people, but its activity must still be stored before the raw rows go.
 */
async function returningOnlyFixture(db: PGlite, daysAgo: number) {
  await db.exec(`
    CREATE TEMP TABLE r AS SELECT
      date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')::date - ${daysAgo})::date AS week,
      ((date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')::date - ${daysAgo})::date + time '10:00') AT TIME ZONE 'Asia/Seoul') AS t0;
    INSERT INTO site_visit_logs (visitor_key, path, created_at)
      SELECT 'returning', '/', t0 - interval '7 days' FROM r
      UNION ALL SELECT 'returning', '/', t0 FROM r;
  `);
}

const weekRow = async (db: PGlite, sql: string) =>
  (
    await db.query<Record<string, unknown>>(`
      SELECT new_people, returned_7d, returned_30d, active_people
      FROM usage_weekly_cohorts WHERE cohort_week = (${sql})`)
  ).rows;

test("a week with only returning visitors is stored with zero new people", async () => {
  const db = await setup();
  await returningOnlyFixture(db, 60);
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.deepEqual(await weekRow(db, "SELECT week FROM r"), [
    { new_people: 0, returned_7d: 0, returned_30d: 0, active_people: 1 },
  ]);
});

test("first run backfill stores old weeks before deleting their raw rows", async () => {
  const db = await setup();
  await returningOnlyFixture(db, 110);
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.equal(await count(db, "SELECT count(*) AS n FROM site_visit_logs"), 0);
  assert.deepEqual(await weekRow(db, "SELECT week FROM r"), [
    { new_people: 0, returned_7d: 0, returned_30d: 0, active_people: 1 },
  ]);
  // The week of the first visit holds that person as new.
  assert.deepEqual(await weekRow(db, "SELECT week - 7 FROM r"), [
    { new_people: 1, returned_7d: 0, returned_30d: 1, active_people: 1 },
  ]);
});

test("weeks without visits are stored as zero, so a missing row means not computed", async () => {
  const db = await setup();
  await db.exec(`
    INSERT INTO site_visit_logs (visitor_key, path, created_at) VALUES
      ('a', '/', now() - interval '80 days'),
      ('b', '/', now() - interval '50 days');
  `);
  await db.query("SELECT snapshot_usage_weekly_cohorts()");
  const rows = (
    await db.query<{ gap: number; n: number; zeros: number }>(`
      SELECT
        (max(cohort_week) - min(cohort_week)) / 7 + 1 AS gap,
        count(*) AS n,
        count(*) FILTER (WHERE active_people = 0) AS zeros
      FROM usage_weekly_cohorts`)
  ).rows[0];
  assert.equal(Number(rows.n), Number(rows.gap)); // no holes
  assert(Number(rows.zeros) >= 2);
  assert.equal(
    await count(db, "SELECT sum(active_people) AS n FROM usage_weekly_cohorts"),
    2,
  );
  // Unfinished weeks (the last 37 days) are not stored yet.
  assert.equal(
    await count(
      db,
      "SELECT count(*) AS n FROM usage_weekly_cohorts WHERE cohort_week > (now() AT TIME ZONE 'Asia/Seoul')::date - 37",
    ),
    0,
  );
});

/**
 * Codex re-review (8092576): once every raw row has expired, weeks must keep
 * being stored from the last stored week, and stay contiguous after new visits.
 */
async function expiredFixture(db: PGlite, lastStoredDaysAgo: number) {
  await db.exec(`
    CREATE TEMP TABLE e AS SELECT
      date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')::date - ${lastStoredDaysAgo})::date AS last_week;
    INSERT INTO usage_weekly_cohorts
      (cohort_week, new_people, returned_7d, returned_30d, active_people, lookback_complete)
      SELECT last_week, 1, 0, 0, 1, true FROM e;
  `);
}

test("weeks keep being stored after every raw row has expired", async () => {
  const db = await setup();
  await expiredFixture(db, 60);
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.deepEqual(await weekRow(db, "SELECT last_week + 7 FROM e"), [
    { new_people: 0, returned_7d: 0, returned_30d: 0, active_people: 0 },
  ]);
});

test("a new visit after a long gap does not skip the empty weeks before it", async () => {
  const db = await setup();
  await expiredFixture(db, 60);
  await db.exec(
    "INSERT INTO site_visit_logs (visitor_key, path, created_at) VALUES ('back', '/', now() - interval '1 day')",
  );
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.deepEqual(await weekRow(db, "SELECT last_week + 7 FROM e"), [
    { new_people: 0, returned_7d: 0, returned_30d: 0, active_people: 0 },
  ]);
  const { rows } = await db.query<{ gap: number; n: number }>(
    "SELECT (max(cohort_week) - min(cohort_week)) / 7 + 1 AS gap, count(*) AS n FROM usage_weekly_cohorts",
  );
  assert.equal(Number(rows[0].n), Number(rows[0].gap));
});

test("nothing is stored before collection has any stored week or raw visit", async () => {
  const db = await setup();
  assert.equal(
    Number(
      (
        await db.query<{ n: number }>(
          "SELECT snapshot_usage_weekly_cohorts() AS n",
        )
      ).rows[0].n,
    ),
    0,
  );
});

test("lookback is complete only where raw visits were never purged", async () => {
  const db = await setup();
  await expiredFixture(db, 210);
  await db.exec(`
    INSERT INTO usage_log_retention_state (collection_started_at, raw_purged_before)
      SELECT (SELECT last_week FROM e)::timestamp AT TIME ZONE 'Asia/Seoul', raw_cutoff
      FROM usage_log_retention_cutoffs();
  `);
  await db.query("SELECT snapshot_usage_weekly_cohorts()");
  const rows = (
    await db.query<{ ok: boolean; expected: boolean }>(`
      SELECT
        lookback_complete AS ok,
        (cohort_week::timestamp AT TIME ZONE 'Asia/Seoul') - interval '45 days'
          >= (SELECT raw_purged_before FROM usage_log_retention_state) AS expected
      FROM usage_weekly_cohorts
      WHERE cohort_week > (SELECT last_week FROM e)
      ORDER BY cohort_week`)
  ).rows;
  assert(rows.length > 20);
  assert(rows.some((r) => r.ok) && rows.some((r) => !r.ok));
  for (const row of rows) assert.equal(row.ok, row.expected);
});

test("each run records the raw cutoff it applied, never moving it back", async () => {
  const db = await setup();
  await db.exec(
    "INSERT INTO usage_log_retention_state (raw_purged_before) VALUES (now() + interval '1 day')",
  );
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.equal(
    await count(
      db,
      "SELECT count(*) AS n FROM usage_log_retention_state WHERE raw_purged_before > now()",
    ),
    1,
  );
  await db.exec(
    "UPDATE usage_log_retention_state SET raw_purged_before = now() - interval '1 year'",
  );
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.equal(
    await count(
      db,
      `SELECT count(*) AS n FROM usage_log_retention_state, usage_log_retention_cutoffs()
       WHERE abs(extract(epoch FROM raw_purged_before - raw_cutoff)) < 60`,
    ),
    1,
  );
  const { rows } = await db.query<{ any_role: boolean }>(`
    SELECT bool_or(has_table_privilege(r, 'usage_log_retention_state', 'SELECT, INSERT, UPDATE, DELETE')) AS any_role
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r`);
  assert.equal(rows[0].any_role, false);
});

/**
 * Codex re-review (8e40f12): collection that began on a Saturday must not count
 * the Monday-to-Friday before it as observed, even after its raw rows are gone.
 */
test("lookback uses the exact collection start, not its week", async () => {
  const db = await setup();
  await db.exec(`
    CREATE TEMP TABLE e AS SELECT
      date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul')::date - 120)::date AS last_week;
    INSERT INTO usage_weekly_cohorts
      (cohort_week, new_people, returned_7d, returned_30d, active_people, lookback_complete)
      SELECT last_week, 1, 0, 0, 1, false FROM e;
    INSERT INTO usage_log_retention_state (collection_started_at)
      SELECT ((last_week + 5)::timestamp + time '10:00') AT TIME ZONE 'Asia/Seoul' FROM e;
  `);
  await db.query("SELECT snapshot_usage_weekly_cohorts()");
  const flag = async (weeksAfter: number) =>
    (
      await db.query<{ lookback_complete: boolean }>(
        `SELECT lookback_complete FROM usage_weekly_cohorts
         WHERE cohort_week = (SELECT last_week FROM e) + ${weeksAfter * 7}`,
      )
    ).rows[0]?.lookback_complete;
  assert.equal(await flag(7), false); // lookback starts on the Friday before collection
  assert.equal(await flag(8), true); // lookback starts after the Saturday start
});

test("the exact first visit is kept after its raw row is purged", async () => {
  const db = await setup();
  await db.exec(`
    INSERT INTO site_visit_logs (visitor_key, path, created_at) VALUES
      ('first', '/', '2026-05-16 10:00+09'),
      ('later', '/', now() - interval '1 day');
  `);
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.equal(
    await count(
      db,
      "SELECT count(*) AS n FROM site_visit_logs WHERE visitor_key = 'first'",
    ),
    0,
  );
  const started = async () =>
    (
      await db.query<{ ok: boolean }>(
        "SELECT collection_started_at = '2026-05-16 10:00+09' AS ok FROM usage_log_retention_state",
      )
    ).rows[0]?.ok;
  assert.equal(await started(), true);
  // A later run with only newer raw rows never moves the start forward.
  await db.query("SELECT * FROM run_usage_log_retention(50000)");
  assert.equal(await started(), true);
});
