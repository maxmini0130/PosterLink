import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  "supabase/migrations/20261110010000_add_deadline_verification_fields.sql",
  "utf8",
).replace(/NOTIFY pgrst[^;]*;/g, "");

// posters as written by 20260804000000 (deadline_type with its inline check).
async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.posters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      poster_status text,
      application_end_at timestamptz,
      deadline_type text NOT NULL DEFAULT 'unknown'
        CHECK (deadline_type IN ('fixed', 'ongoing', 'until_exhausted', 'scheduled', 'unknown'))
    );
    INSERT INTO public.posters (title, poster_status, application_end_at, deadline_type)
    VALUES ('old fixed', 'published', '2026-11-19T14:59:59Z', 'fixed'),
           ('old ongoing', 'published', NULL, 'ongoing');
  `);
  return db;
}

test("existing rows get defaults that claim nothing", async () => {
  const db = await setup();
  await db.exec(migration);
  const { rows } = await db.query<{
    deadline_status: string;
    deadline_time_verified: boolean;
    reception_verified: boolean;
    deadline_source: string | null;
  }>(
    "SELECT deadline_status, deadline_time_verified, reception_verified, deadline_source FROM posters ORDER BY title",
  );
  for (const row of rows) {
    assert.equal(row.deadline_status, "unverified");
    assert.equal(row.deadline_time_verified, false);
    assert.equal(row.reception_verified, false);
    assert.equal(row.deadline_source, null);
  }
});

test("an insert written by today's code still works", async () => {
  const db = await setup();
  await db.exec(migration);
  await db.exec(`
    INSERT INTO posters (title, poster_status, application_end_at, deadline_type)
    VALUES ('crawler row', 'review', '2026-11-30T14:59:59Z', 'until_exhausted');
  `);
  const { rows } = await db.query<{ deadline_status: string }>(
    "SELECT deadline_status FROM posters WHERE title = 'crawler row'",
  );
  assert.equal(rows[0].deadline_status, "unverified");
});

test("per_session becomes a valid type and unknown values stay rejected", async () => {
  const db = await setup();
  await db.exec(migration);
  await db.exec(
    "UPDATE posters SET deadline_type = 'per_session' WHERE title = 'old fixed'",
  );
  await assert.rejects(
    db.exec(
      "UPDATE posters SET deadline_type = 'rolling' WHERE title = 'old fixed'",
    ),
  );
});

test("a verified time needs a verified date and a readable source", async () => {
  const db = await setup();
  await db.exec(migration);
  // Not allowed: time verified on an unverified date.
  await assert.rejects(
    db.exec(
      "UPDATE posters SET deadline_time_verified = true WHERE title = 'old fixed'",
    ),
  );
  // Not allowed: a portal or legacy date cannot carry a verified time.
  await assert.rejects(
    db.exec(
      "UPDATE posters SET deadline_status = 'verified', deadline_source = 'legacy', deadline_time_verified = true WHERE title = 'old fixed'",
    ),
  );
  await db.exec(
    "UPDATE posters SET deadline_status = 'verified', deadline_source = 'poster', deadline_time_verified = true WHERE title = 'old fixed'",
  );
  await assert.rejects(
    db.exec(
      "UPDATE posters SET deadline_source = 'guess' WHERE title = 'old fixed'",
    ),
  );
  await assert.rejects(
    db.exec(
      "UPDATE posters SET deadline_status = 'maybe' WHERE title = 'old fixed'",
    ),
  );
});

test("the migration can run twice", async () => {
  const db = await setup();
  await db.exec(migration);
  await db.exec(migration);
  const { rows } = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'posters_deadline_type_check'",
  );
  assert.equal(rows[0].n, 1);
});
