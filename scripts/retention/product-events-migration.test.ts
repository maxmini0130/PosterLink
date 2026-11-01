import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8");
const posterViews = read("20260503000000_add_poster_view_logs.sql");
const alertEvents = read("20260924020000_add_alert_cta_rpc_and_events.sql");
const migration = read(
  "20261031010000_extend_product_events_for_retention.sql",
);

const NEW_USER = "11111111-1111-4111-8111-111111111111";
const OLD_USER = "22222222-2222-4222-8222-222222222222";
const NO_PROFILE = "33333333-3333-4333-8333-333333333333";
const POSTER = "44444444-4444-4444-8444-444444444444";
const INSTITUTION = "55555555-5555-4555-8555-555555555555";
const MISSING = "66666666-6666-4666-8666-666666666666";
const WEB_KEY = "web-visitor-0001";
const APP_KEY = "app-visitor-0001";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    CREATE TABLE profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
    CREATE TABLE posters (id uuid PRIMARY KEY, poster_status text);
    CREATE TABLE institutions (id uuid PRIMARY KEY);
    CREATE TABLE regions (id uuid PRIMARY KEY, parent_id uuid, level text, name text, full_name text);
    CREATE TABLE categories (id uuid PRIMARY KEY, name text);
    SET check_function_bodies = off;
    -- Supabase grants new public tables and functions to the API roles by default.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(posterViews);
  await db.exec(alertEvents.replace(/NOTIFY pgrst[^;]*;/g, ""));
  await db.exec(migration.replace(/NOTIFY pgrst[^;]*;/g, ""));
  await db.exec(`
    INSERT INTO auth.users VALUES ('${NEW_USER}', now() - interval '5 minutes'), ('${OLD_USER}', now() - interval '10 days'), ('${NO_PROFILE}', now());
    INSERT INTO profiles (id) VALUES ('${NEW_USER}'), ('${OLD_USER}');
    INSERT INTO posters VALUES ('${POSTER}', 'published');
    INSERT INTO institutions VALUES ('${INSTITUTION}');
  `);
  return db;
}

async function as<T>(
  db: PGlite,
  role: "anon" | "authenticated",
  sub: string | null,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.query(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
      sub ? JSON.stringify({ sub }) : "",
    ]);
    return (await tx.query<T>(sql, params)).rows;
  });
}

const record = `SELECT record_product_event($1, $2, 's1', $3, $4::uuid, $5::uuid, $6::jsonb)`;
const link = `SELECT link_visitor_identity($1, 's1', $2, $3, $4) AS result`;

test("existing alert events keep their required fields", async () => {
  const db = await setup();
  await db.query(
    `INSERT INTO product_events (event_name, poster_id, poster_status, region, category, cta_variant)
     VALUES ('alert_cta_view', $1, 'closed', '마포구', '교육', 'closed_poster_v1')`,
    [POSTER],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO product_events (event_name, poster_id) VALUES ('alert_cta_view', $1)`,
      [POSTER],
    ),
    /product_events_alert_fields_check/,
  );
  await assert.rejects(
    db.query(`INSERT INTO product_events (event_name) VALUES ('page_view')`),
    /event_name_check/,
  );
});

test("record_product_event takes user_id from the session only", async () => {
  const db = await setup();
  await as(db, "anon", null, record, [
    "favorite_add",
    WEB_KEY,
    "web",
    POSTER,
    null,
    '{"screen":"detail","logged_in":false}',
  ]);
  await as(db, "authenticated", OLD_USER, record, [
    "institution_follow",
    WEB_KEY,
    "app",
    null,
    INSTITUTION,
    '{"screen":"institution"}',
  ]);
  await as(db, "anon", null, record, [
    "share_click",
    WEB_KEY,
    "web",
    MISSING,
    null,
    '{"channel":"link_copy"}',
  ]);
  const rows = (
    await db.query<{
      event_name: string;
      user_id: string | null;
      client: string;
      poster_id: string | null;
      institution_id: string | null;
    }>(
      `SELECT event_name, user_id, client, poster_id, institution_id FROM product_events ORDER BY created_at, event_name`,
    )
  ).rows;
  assert.deepEqual(
    rows
      .map((r) => [
        r.event_name,
        r.user_id,
        r.client,
        r.poster_id,
        r.institution_id,
      ])
      .sort(),
    [
      ["favorite_add", null, "web", POSTER, null],
      ["institution_follow", OLD_USER, "app", null, INSTITUTION],
      // unknown poster ids are not trusted as references
      ["share_click", null, "web", null, null],
    ],
  );
});

test("record_product_event rejects unsupported names, metadata and keys", async () => {
  const db = await setup();
  const bad: unknown[][] = [
    ["signup_complete", WEB_KEY, "web", null, null, "{}"],
    ["alert_cta_view", WEB_KEY, "web", null, null, "{}"],
    ["page_view", WEB_KEY, "web", null, null, "{}"],
    ["favorite_add", "short", "web", null, null, "{}"],
    ["favorite_add", WEB_KEY, "desktop", null, null, "{}"],
    ["favorite_add", WEB_KEY, "web", null, null, '{"email":"a@b.c"}'],
    [
      "favorite_add",
      WEB_KEY,
      "web",
      null,
      null,
      `{"screen":"${"x".repeat(65)}"}`,
    ],
    ["favorite_add", WEB_KEY, "web", null, null, '{"screen":{"nested":true}}'],
    ["favorite_add", WEB_KEY, "web", null, null, "[]"],
  ];
  for (const params of bad) {
    await assert.rejects(
      as(db, "anon", null, record, params),
      /unsupported event|invalid/,
      JSON.stringify(params),
    );
  }
  assert.deepEqual(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM product_events`,
      )
    ).rows[0].n,
    0,
  );
});

test("clients cannot read or write the event tables directly", async () => {
  const db = await setup();
  for (const role of ["anon", "authenticated"] as const) {
    await assert.rejects(
      as(db, role, OLD_USER, `SELECT * FROM product_events`),
      /permission denied/,
    );
    await assert.rejects(
      as(db, role, OLD_USER, `SELECT * FROM visitor_identity_links`),
      /permission denied/,
    );
    await assert.rejects(
      as(
        db,
        role,
        OLD_USER,
        `INSERT INTO visitor_identity_links VALUES ('${WEB_KEY}', '${OLD_USER}', 'web')`,
      ),
      /permission denied/,
    );
  }
  await assert.rejects(
    as(db, "anon", null, link, [WEB_KEY, "web", null, null]),
    /permission denied/,
  );
});

test("identity link records signup_complete once for a new account across web and app", async () => {
  const db = await setup();
  const first = await as<{ result: string }>(
    db,
    "authenticated",
    NEW_USER,
    link,
    [WEB_KEY, "web", "detail", "favorite"],
  );
  const again = await as<{ result: string }>(
    db,
    "authenticated",
    NEW_USER,
    link,
    [WEB_KEY, "web", "detail", "favorite"],
  );
  const app = await as<{ result: string }>(
    db,
    "authenticated",
    NEW_USER,
    link,
    [APP_KEY, "app", "institution", "follow"],
  );
  assert.deepEqual(
    [first[0].result, again[0].result, app[0].result],
    ["signup", "linked", "linked"],
  );

  const links = (
    await db.query<{ visitor_key: string; client: string }>(
      `SELECT visitor_key, client FROM visitor_identity_links WHERE user_id = $1 ORDER BY visitor_key`,
      [NEW_USER],
    )
  ).rows;
  assert.deepEqual(links, [
    { visitor_key: APP_KEY, client: "app" },
    { visitor_key: WEB_KEY, client: "web" },
  ]);
  const signups = (
    await db.query<{ visitor_key: string; metadata_json: unknown }>(
      `SELECT visitor_key, metadata_json FROM product_events WHERE event_name = 'signup_complete' AND user_id = $1`,
      [NEW_USER],
    )
  ).rows;
  assert.deepEqual(signups, [
    {
      visitor_key: WEB_KEY,
      metadata_json: { screen: "detail", feature: "favorite" },
    },
  ]);
});

test("existing members and missing profiles never become signups", async () => {
  const db = await setup();
  const old = await as<{ result: string }>(
    db,
    "authenticated",
    OLD_USER,
    link,
    [WEB_KEY, "web", "login", "direct"],
  );
  const pending = await as<{ result: string }>(
    db,
    "authenticated",
    NO_PROFILE,
    link,
    [WEB_KEY, "web", null, null],
  );
  assert.deepEqual([old[0].result, pending[0].result], ["linked", "pending"]);
  assert.equal(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM product_events`,
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM visitor_identity_links`,
      )
    ).rows[0].n,
    1,
  );
  // unsafe origin values are dropped instead of stored
  await db.query(`UPDATE auth.users SET created_at = now() WHERE id = $1`, [
    OLD_USER,
  ]);
  await as(db, "authenticated", OLD_USER, link, [
    APP_KEY,
    "app",
    "Detail Page",
    "x;y",
  ]);
  assert.deepEqual(
    (
      await db.query(
        `SELECT metadata_json FROM product_events WHERE event_name='signup_complete'`,
      )
    ).rows,
    [{ metadata_json: {} }],
  );
});

test("poster_view_logs accepts only known sources", async () => {
  const db = await setup();
  await as(
    db,
    "anon",
    null,
    `INSERT INTO poster_view_logs (poster_id, visitor_key, source) VALUES ($1, $2, 'related')`,
    [POSTER, WEB_KEY],
  );
  await as(
    db,
    "anon",
    null,
    `INSERT INTO poster_view_logs (poster_id, visitor_key) VALUES ($1, $2)`,
    [POSTER, WEB_KEY],
  );
  await assert.rejects(
    as(
      db,
      "anon",
      null,
      `INSERT INTO poster_view_logs (poster_id, source) VALUES ($1, 'twitter')`,
      [POSTER],
    ),
    /poster_view_logs_source_check/,
  );
});
