import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20261101010000_add_favorite_user_status.sql",
  "utf8",
).replace(/NOTIFY pgrst[^;]*;/g, "");

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const POSTER = "33333333-3333-4333-8333-333333333333";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE profiles (id uuid PRIMARY KEY);
    CREATE TABLE posters (id uuid PRIMARY KEY, poster_status text);
    -- favorites as in 20260417000000_consolidated_schema.sql + delta policy
    CREATE TABLE favorites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      poster_id uuid REFERENCES posters(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      UNIQUE (user_id, poster_id)
    );
    ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "favorites_all" ON favorites FOR ALL USING (auth.uid() = user_id);
    GRANT ALL ON favorites TO authenticated;
    INSERT INTO profiles VALUES ('${OWNER}'), ('${OTHER}');
    INSERT INTO posters VALUES ('${POSTER}', 'published');
    INSERT INTO favorites (user_id, poster_id) VALUES ('${OWNER}', '${POSTER}'), ('${OTHER}', '${POSTER}');
  `);
  await db.exec(migration);
  return db;
}

async function as(db: PGlite, sub: string, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE authenticated");
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub }),
    ]);
    return (await tx.query<Record<string, unknown>>(sql)).rows;
  });
}

test("existing favorites become interested and only the two states are allowed", async () => {
  const db = await setup();
  const rows = (
    await db.query<{ user_status: string }>("SELECT user_status FROM favorites")
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.user_status),
    ["interested", "interested"],
  );
  await assert.rejects(
    db.query("UPDATE favorites SET user_status = 'selected'"),
    /favorites_user_status_check/,
  );
  // Re-running the migration is harmless.
  await db.exec(migration);
});

test("a person can mark only their own favorite, and a closed poster keeps the mark", async () => {
  const db = await setup();
  await as(
    db,
    OWNER,
    "UPDATE favorites SET user_status = 'applied', user_status_updated_at = now()",
  );
  const rows = (
    await db.query<{ user_id: string; user_status: string }>(
      "SELECT user_id, user_status FROM favorites ORDER BY user_id",
    )
  ).rows;
  assert.deepEqual(rows, [
    { user_id: OWNER, user_status: "applied" },
    { user_id: OTHER, user_status: "interested" },
  ]);
  await db.exec(`UPDATE posters SET poster_status = 'closed'`);
  const mine = await as(db, OWNER, "SELECT user_status FROM favorites");
  assert.deepEqual(mine, [{ user_status: "applied" }]);
});
