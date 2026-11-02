import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(
  new URL(
    "../../supabase/migrations/20261102030000_allow_admin_comment_moderation.sql",
    import.meta.url,
  ),
  "utf8",
);

/** The comment tables and the owner policies production has today. */
const SCHEMA = `
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  CREATE TYPE user_role AS ENUM ('user', 'operator', 'admin', 'super_admin');
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role user_role NOT NULL);
  CREATE TABLE public.comments (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'normal'
  );
  ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
  CREATE POLICY comments_select ON public.comments FOR SELECT USING (true);
  CREATE POLICY comments_update ON public.comments FOR UPDATE
    USING (auth.uid() = user_id);
  CREATE ROLE app_user;
  GRANT USAGE ON SCHEMA auth TO app_user;
  GRANT SELECT ON public.profiles TO app_user;
  GRANT SELECT, UPDATE ON public.comments TO app_user;
  INSERT INTO public.profiles VALUES
    ('00000000-0000-0000-0000-00000000000a', 'admin'),
    ('00000000-0000-0000-0000-00000000000b', 'user'),
    ('00000000-0000-0000-0000-00000000000c', 'user');
  INSERT INTO public.comments (id, user_id) VALUES
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
`;

async function hideAs(db: PGlite, uid: string) {
  await db.exec(`SET test.uid = '${uid}'; SET ROLE app_user;`);
  const result = await db.query(
    "UPDATE public.comments SET status = 'hidden' WHERE id = '10000000-0000-0000-0000-000000000001'",
  );
  await db.exec("RESET ROLE;");
  return result.affectedRows ?? 0;
}

test("before the migration an admin's hide matches no row (the reported bug)", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  assert.equal(await hideAs(db, "00000000-0000-0000-0000-00000000000a"), 0);
});

test("after the migration an admin hides another user's comment; a user still cannot", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(MIGRATION);
  assert.equal(await hideAs(db, "00000000-0000-0000-0000-00000000000b"), 0);
  assert.equal(await hideAs(db, "00000000-0000-0000-0000-00000000000a"), 1);
  const { rows } = await db.query<{ status: string }>(
    "SELECT status FROM public.comments",
  );
  assert.equal(rows[0].status, "hidden");
});
