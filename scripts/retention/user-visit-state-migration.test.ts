import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20261101020000_add_user_visit_state.sql",
  "utf8",
).replace(/NOTIFY pgrst[^;]*;/g, "");

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
    CREATE TABLE profiles (id uuid PRIMARY KEY);
    INSERT INTO profiles VALUES ('${OWNER}'), ('${OTHER}');
  `);
  await db.exec(migration);
  return db;
}

async function as(db: PGlite, role: string, sub: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      sub ? JSON.stringify({ sub }) : "",
    ]);
    return (await tx.query<Record<string, unknown>>(sql)).rows;
  });
}

const at = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 1, 0, minutes)).toISOString();
const record = (started: number, active: number, baseline: number | null) =>
  `SELECT * FROM record_user_visit('${at(started)}', '${at(active)}', ${
    baseline === null ? "NULL" : `'${at(baseline)}'`
  })`;
const iso = (value: unknown) => new Date(value as string).toISOString();
const stored = async (db: PGlite, user = OWNER) =>
  (
    await db.query<Record<string, unknown>>(
      `SELECT visit_started_at, last_active_at, baseline_at FROM user_visit_state WHERE user_id = '${user}'`,
    )
  ).rows.map((row) => ({
    started: iso(row.visit_started_at),
    active: iso(row.last_active_at),
    baseline: row.baseline_at === null ? null : iso(row.baseline_at),
  }));

test("a delayed write from another device never moves the visit back", async () => {
  // Both devices read the same row; B (00:10) is stored first, A (00:05) arrives late.
  const late = await setup();
  await as(late, "authenticated", OWNER, record(0, 10, null));
  const returned = await as(late, "authenticated", OWNER, record(0, 5, null));
  assert.deepEqual(await stored(late), [
    { started: at(0), active: at(10), baseline: null },
  ]);
  // The caller gets the record that is kept, to adopt it.
  assert.equal(iso(returned[0].last_active_at), at(10));

  // A new visit from one device replaces all three times together.
  await as(late, "authenticated", OWNER, record(50, 55, 10));
  await as(late, "authenticated", OWNER, record(0, 12, null)); // old visit, late
  assert.deepEqual(await stored(late), [
    { started: at(50), active: at(55), baseline: at(10) },
  ]);

  // Same pair in arrival order: the later activity wins either way.
  const ordered = await setup();
  await as(ordered, "authenticated", OWNER, record(0, 5, null));
  await as(ordered, "authenticated", OWNER, record(0, 10, null));
  assert.deepEqual(await stored(ordered), [
    { started: at(0), active: at(10), baseline: null },
  ]);
});

test("only the signed-in member's own row, read-only table, no signed-out access", async () => {
  const db = await setup();
  await as(db, "authenticated", OWNER, record(0, 1, null));
  assert.deepEqual(
    await as(db, "authenticated", OTHER, "SELECT * FROM user_visit_state"),
    [],
  );
  // Direct writes are not granted; the function is the only way in.
  await assert.rejects(
    as(
      db,
      "authenticated",
      OWNER,
      `UPDATE user_visit_state SET last_active_at = '${at(99)}'`,
    ),
    /permission denied/,
  );
  await assert.rejects(
    as(db, "anon", null, "SELECT * FROM user_visit_state"),
    /permission denied/,
  );
  await assert.rejects(
    as(db, "anon", null, record(0, 1, null)),
    /permission denied/,
  );
  await assert.rejects(
    as(db, "authenticated", null, record(0, 1, null)),
    /not signed in/,
  );
});

test("times must be in order, far-future clocks are ignored, the row goes with the account", async () => {
  const db = await setup();
  await assert.rejects(
    as(db, "authenticated", OWNER, record(10, 5, null)),
    /user_visit_state_order_check/,
  );
  await assert.rejects(
    as(db, "authenticated", OWNER, record(0, 1, 5)),
    /user_visit_state_order_check/,
  );
  await as(db, "authenticated", OWNER, record(0, 1, null));
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await as(
    db,
    "authenticated",
    OWNER,
    `SELECT * FROM record_user_visit('${future}', '${future}', NULL)`,
  );
  assert.equal((await stored(db))[0].active, at(1));
  await db.query(`DELETE FROM profiles WHERE id = '${OWNER}'`);
  assert.deepEqual(await stored(db), []);
  await db.exec(migration);
});
