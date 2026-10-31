import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Runs the SQL exactly as written in the metrics document.
const read = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8").replace(
    /NOTIFY pgrst[^;]*;/g,
    "",
  );
const doc = readFileSync("docs/retention_metrics_20261031.md", "utf8");
const [Q1, Q2, Q3, Q4] = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) =>
  m[1].replace(/:since/g, "'2026-01-01'::timestamptz"),
);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SHARED = "shared-browser-key";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TYPE user_role AS ENUM ('user','operator','admin','super_admin');
    CREATE TABLE profiles (id uuid PRIMARY KEY, role user_role NOT NULL DEFAULT 'user');
    CREATE TABLE posters (id uuid PRIMARY KEY, poster_status text);
    CREATE TABLE institutions (id uuid PRIMARY KEY);
    CREATE TABLE favorites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, poster_id uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE institution_follows (user_id uuid, institution_id uuid, created_at timestamptz DEFAULT now());
    SET check_function_bodies = off;
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
  await db.exec(read("20260924020000_add_alert_cta_rpc_and_events.sql"));
  await db.exec(read("20261031010000_extend_product_events_for_retention.sql"));
  return db;
}

/**
 * Codex review #2: one browser key, account A linked first and B second, both
 * active signups, one logged-out revisit. Only A owns that revisit, so 50%.
 */
async function sharedBrowserFixture() {
  const db = await setup();
  await db.exec(`
    INSERT INTO auth.users VALUES ('${A}', now() - interval '40 days'), ('${B}', now() - interval '39 days');
    INSERT INTO profiles (id) VALUES ('${A}'), ('${B}');
    INSERT INTO visitor_identity_links (visitor_key, user_id, client, first_linked_at) VALUES
      ('${SHARED}', '${A}', 'web', now() - interval '40 days'),
      ('${SHARED}', '${B}', 'web', now() - interval '39 days');
    INSERT INTO site_visit_logs (visitor_key, path, created_at) VALUES
      ('${SHARED}', '/', now() - interval '41 days'),
      ('${SHARED}', '/', now() - interval '37 days');
    INSERT INTO favorites (user_id, poster_id, created_at) VALUES
      ('${A}', gen_random_uuid(), now() - interval '39 days 12 hours'),
      ('${B}', gen_random_uuid(), now() - interval '38 days 12 hours');
    INSERT INTO product_events (event_name, user_id, visitor_key, client, metadata_json, created_at) VALUES
      ('signup_complete', '${A}', '${SHARED}', 'web', '{"screen":"detail","feature":"favorite"}', now() - interval '40 days'),
      ('signup_complete', '${B}', '${SHARED}', 'web', '{"screen":"login","feature":"direct"}', now() - interval '39 days'),
      ('signup_prompt_shown', NULL, '${SHARED}', 'web', '{"screen":"detail","feature":"favorite"}', now() - interval '41 days');
  `);
  return db;
}

test("Q2 attributes a shared browser's logged-out revisit to the first linked account only", async () => {
  const db = await sharedBrowserFixture();
  const [row] = (await db.query<Record<string, unknown>>(Q2)).rows;
  assert.equal(row.signups, 2);
  assert.equal(row.active_signups, 2);
  assert.equal(row.active_eligible_7d, 2);
  assert.equal(row.active_revisit_7d_pct, "50.0");
  assert.equal(row.active_revisit_30d_pct, "50.0");
});

test("Q1 counts each logged-out visit for one person", async () => {
  const db = await sharedBrowserFixture();
  const rows = (
    await db.query<{ new_people: number; revisit_7d_pct: string }>(Q1)
  ).rows;
  // A owns both shared-key visits; B has no visit of its own.
  assert.equal(
    rows.reduce((sum, r) => sum + Number(r.new_people), 0),
    1,
  );
  assert.deepEqual(
    rows.map((r) => r.revisit_7d_pct),
    ["100.0"],
  );
});

test("Q4 gives pre-signup anonymous history only to the account that owns the key", async () => {
  const db = await sharedBrowserFixture();
  const [row] = (await db.query<Record<string, unknown>>(Q4)).rows;
  assert.equal(row.linked_accounts, 2);
  assert.equal(row.shared_browser_accounts, 1);
  assert.equal(row.with_anonymous_visits_before, 1);
  assert.equal(row.saw_signup_prompt_before, 1);
});

test("Q3 groups prompt, start and completion by origin", async () => {
  const db = await sharedBrowserFixture();
  const rows = (
    await db.query<{
      screen: string;
      feature: string;
      prompts: number;
      completes: number;
    }>(Q3)
  ).rows;
  assert.deepEqual(
    rows.map((r) => [
      r.screen,
      r.feature,
      Number(r.prompts),
      Number(r.completes),
    ]),
    [
      ["detail", "favorite", 1, 1],
      ["login", "direct", 0, 1],
    ],
  );
});
