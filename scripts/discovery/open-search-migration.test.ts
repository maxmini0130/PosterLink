import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(
  new URL(
    "../../supabase/migrations/20261102010000_exclude_finished_events_from_open_search.sql",
    import.meta.url,
  ),
  "utf8",
);

/** Only the columns the two functions read. */
const SCHEMA = `
  CREATE TABLE public.posters (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    source_org_name text,
    summary_short text,
    poster_status text NOT NULL,
    exposure_tier text,
    application_start_at timestamptz,
    application_end_at timestamptz,
    deadline_type text,
    event_end_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.poster_categories (poster_id uuid, category_id uuid);
  CREATE TABLE public.poster_regions (poster_id uuid, region_id uuid);
`;

const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString();

async function database() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(MIGRATION);
  const rows: Array<[string, string | null, string | null, string | null]> = [
    // title, deadline_type, application_end_at, event_end_at
    ["ended event, until filled", "until_exhausted", null, iso(-3)],
    ["ended event, ongoing", "ongoing", null, iso(-3)],
    ["ended event, later fixed session", "fixed", iso(5), iso(-3)],
    ["ended event, unknown with end date", "unknown", iso(5), iso(-3)],
    ["event later, until filled", "until_exhausted", null, iso(3)],
    ["no event date, until filled", "until_exhausted", null, null],
    ["fixed, open", "fixed", iso(5), null],
  ];
  let n = 0;
  for (const [title, type, end, eventEnd] of rows) {
    n += 1;
    await db.query(
      `INSERT INTO public.posters
         (id, title, poster_status, deadline_type, application_end_at, event_end_at, created_at)
       VALUES ($1, $2, 'published', $3, $4, $5, now() - ($6 || ' minutes')::interval)`,
      [
        `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        title,
        type,
        end,
        eventEnd,
        String(n),
      ],
    );
  }
  return db;
}

test("open search leaves out events that already ended unless a fixed deadline is ahead", async () => {
  const db = await database();
  const open = await db.query<{ title: string }>(
    "SELECT title FROM public.search_public_posters(NULL, NULL, NULL, false) ORDER BY title",
  );
  assert.deepEqual(
    open.rows.map((row) => row.title),
    [
      "ended event, later fixed session",
      "event later, until filled",
      "fixed, open",
      "no event date, until filled",
    ],
  );
  const count = await db.query<{ n: number }>(
    "SELECT public.count_public_posters(NULL, NULL, NULL, false) AS n",
  );
  assert.equal(count.rows[0].n, 4);

  // Searches that include closed posters still list everything published.
  const all = await db.query<{ n: number }>(
    "SELECT public.count_public_posters(NULL, NULL, NULL, true) AS n",
  );
  assert.equal(all.rows[0].n, 7);
  await db.close();
});

test("the last event day still counts as open in Asia/Seoul", async () => {
  const db = await database();
  // Today 23:59:59 in Seoul.
  const { rows } = await db.query<{ end_today: string }>(
    `SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul' - interval '1 second' AS end_today`,
  );
  await db.query(
    `INSERT INTO public.posters (id, title, poster_status, deadline_type, event_end_at)
     VALUES ('00000000-0000-4000-8000-000000000099', 'ends today', 'published', 'until_exhausted', $1)`,
    [rows[0].end_today],
  );
  const found = await db.query(
    "SELECT 1 FROM public.search_public_posters('ends today', NULL, NULL, false)",
  );
  assert.equal(found.rows.length, 1);
  await db.close();
});
