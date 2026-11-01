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

const upsert = (user: string, started: string, active: string, base: string) =>
  `INSERT INTO user_visit_state (user_id, visit_started_at, last_active_at, baseline_at)
   VALUES ('${user}', '${started}', '${active}', ${base})
   ON CONFLICT (user_id) DO UPDATE SET visit_started_at = EXCLUDED.visit_started_at,
     last_active_at = EXCLUDED.last_active_at, baseline_at = EXCLUDED.baseline_at,
     updated_at = now()`;

test("a member reads and writes only their own visit row", async () => {
  const db = await setup();
  const t = "2026-11-01T00:00:00Z";
  await as(db, "authenticated", OWNER, upsert(OWNER, t, t, "NULL"));
  await as(
    db,
    "authenticated",
    OWNER,
    upsert(OWNER, "2026-11-02T00:00:00Z", "2026-11-02T00:05:00Z", `'${t}'`),
  );
  const own = await as(
    db,
    "authenticated",
    OWNER,
    "SELECT baseline_at FROM user_visit_state",
  );
  assert.equal(own.length, 1);
  assert.equal(
    new Date(own[0].baseline_at as string).toISOString(),
    "2026-11-01T00:00:00.000Z",
  );
  // Someone else cannot read it or write a row for another account.
  assert.deepEqual(
    await as(db, "authenticated", OTHER, "SELECT * FROM user_visit_state"),
    [],
  );
  await assert.rejects(
    as(db, "authenticated", OTHER, upsert(OWNER, t, t, "NULL")),
    /row-level security|violates/,
  );
  // Signed-out requests have no access at all.
  await assert.rejects(
    as(db, "anon", null, "SELECT * FROM user_visit_state"),
    /permission denied/,
  );
});

test("times must be in order, the row goes with the account, re-running is harmless", async () => {
  const db = await setup();
  await assert.rejects(
    db.query(
      upsert(OWNER, "2026-11-02T00:00:00Z", "2026-11-01T00:00:00Z", "NULL"),
    ),
    /user_visit_state_order_check/,
  );
  await assert.rejects(
    db.query(
      upsert(
        OWNER,
        "2026-11-01T00:00:00Z",
        "2026-11-01T00:00:00Z",
        "'2026-11-03T00:00:00Z'",
      ),
    ),
    /user_visit_state_order_check/,
  );
  const t = "2026-11-01T00:00:00Z";
  await db.query(upsert(OWNER, t, t, "NULL"));
  await db.query(`DELETE FROM profiles WHERE id = '${OWNER}'`);
  assert.equal(
    (await db.query("SELECT * FROM user_visit_state")).rows.length,
    0,
  );
  await db.exec(migration);
});
