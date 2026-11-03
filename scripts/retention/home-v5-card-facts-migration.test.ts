import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// 20261103010000 applied on top of the retention event migration, in PGlite.
const read = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8").replace(
    /NOTIFY pgrst[^;]*;/g,
    "",
  );

const POSTER = "44444444-4444-4444-8444-444444444444";
const HIDDEN = "77777777-7777-4777-8777-777777777777";
const REGION = "88888888-8888-4888-8888-888888888888";
const INSTITUTION = "55555555-5555-4555-8555-555555555555";

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
    CREATE TABLE posters (id uuid PRIMARY KEY, poster_status text, exposure_tier text, created_at timestamptz DEFAULT now());
    CREATE TABLE institutions (id uuid PRIMARY KEY);
    CREATE TABLE regions (id uuid PRIMARY KEY, parent_id uuid, level text, name text, full_name text);
    CREATE TABLE poster_regions (poster_id uuid, region_id uuid, PRIMARY KEY (poster_id, region_id));
    CREATE TABLE categories (id uuid PRIMARY KEY, name text);
    CREATE TABLE favorites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, poster_id uuid, created_at timestamptz DEFAULT now());
    SET check_function_bodies = off;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(read("20260503000000_add_poster_view_logs.sql"));
  await db.exec(read("20260924020000_add_alert_cta_rpc_and_events.sql"));
  await db.exec(read("20261031010000_extend_product_events_for_retention.sql"));
  await db.exec(read("20261103010000_add_home_v5_card_facts.sql"));
  await db.exec(`
    INSERT INTO posters (id, poster_status) VALUES ('${POSTER}', 'published');
    INSERT INTO posters (id, poster_status, exposure_tier) VALUES ('${HIDDEN}', 'published', 'C');
    INSERT INTO institutions VALUES ('${INSTITUTION}');
    INSERT INTO regions (id, level, name) VALUES ('${REGION}', 'sigungu', '마포구');
  `);
  return db;
}

async function asAnon<T>(db: PGlite, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE anon");
    return (await tx.query<T>(sql, params)).rows;
  });
}

const rejects = async (db: PGlite, sql: string) =>
  assert.rejects(() => db.query(sql), /check constraint|violates/);

test("card facts columns are nullable and bounded", async () => {
  const db = await setup();
  await db.query(
    `UPDATE posters SET benefit_summary = '월 최대 20만원 × 12개월', benefit_kind = 'grant',
       event_schedule_kind = 'single', card_facts_status = 'needs_review', featured_week = '2026-11-02'
     WHERE id = $1`,
    [POSTER],
  );
  await rejects(
    db,
    `UPDATE posters SET benefit_summary = '${"가".repeat(21)}'`,
  );
  await rejects(db, `UPDATE posters SET benefit_summary = ''`);
  await rejects(db, `UPDATE posters SET benefit_kind = 'discount'`);
  await rejects(db, `UPDATE posters SET card_facts_status = 'approved'`);
  // featured_week must be a Monday.
  await rejects(db, `UPDATE posters SET featured_week = '2026-11-03'`);
  await db.query(
    `INSERT INTO poster_regions (poster_id, region_id, basis) VALUES ($1, $2, 'venue')`,
    [POSTER, REGION],
  );
  await rejects(db, `UPDATE poster_regions SET basis = 'nearby'`);
});

test("new events and metadata keys are accepted; others still refused", async () => {
  const db = await setup();
  const record = `SELECT record_product_event($1, 'visitor-0001', 's1', 'web', $2::uuid, $3::uuid, $4::jsonb)`;
  await asAnon(db, record, [
    "follow_prompt_shown",
    null,
    INSTITUTION,
    JSON.stringify({
      prompt_id: "fp_abc123",
      trigger: "favorite",
      screen: "home",
      logged_in: false,
    }),
  ]);
  await asAnon(db, record, [
    "feed_card_impression",
    POSTER,
    null,
    JSON.stringify({ section_id: "pick", position: 3, image_kind: "default" }),
  ]);
  await asAnon(db, record, [
    "institution_follow",
    null,
    INSTITUTION,
    JSON.stringify({ prompt_id: "fp_abc123" }),
  ]);
  const rows = (
    await db.query<{ event_name: string }>(
      "SELECT event_name FROM product_events ORDER BY created_at",
    )
  ).rows.map((row) => row.event_name);
  assert.deepEqual(rows, [
    "follow_prompt_shown",
    "feed_card_impression",
    "institution_follow",
  ]);
  await assert.rejects(
    () => asAnon(db, record, ["page_view", null, null, "{}"]),
    /unsupported event/,
  );
  await assert.rejects(
    () =>
      asAnon(db, record, [
        "feed_card_click",
        POSTER,
        null,
        JSON.stringify({ query: "청년" }),
      ]),
    /invalid metadata/,
  );
});

test("7-day popularity returns aggregates for public posters only", async () => {
  const db = await setup();
  await db.query(
    `INSERT INTO favorites (user_id, poster_id, created_at) VALUES
       (gen_random_uuid(), $1, now()), (gen_random_uuid(), $1, now() - interval '9 days'),
       (gen_random_uuid(), $2, now())`,
    [POSTER, HIDDEN],
  );
  await db.query(`INSERT INTO poster_view_logs (poster_id) VALUES ($1), ($1)`, [
    POSTER,
  ]);
  const rows = await asAnon<{
    poster_id: string;
    favorites_7d: number;
    views_7d: number;
  }>(db, "SELECT * FROM public_poster_popularity_7d($1::uuid[])", [
    [POSTER, HIDDEN],
  ]);
  assert.deepEqual(rows, [{ poster_id: POSTER, favorites_7d: 1, views_7d: 2 }]);
});
