import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * A PGlite database with the retention stage 0 migrations applied on top of
 * stand-ins for the older tables they extend, the way Supabase grants new
 * objects to the API roles by default. Shared by the retention SQL tests.
 */
export const readMigration = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8").replace(
    /NOTIFY pgrst[^;]*;/g,
    "",
  );

export async function retentionDb() {
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
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await db.exec(
    readMigration("20260718000000_add_site_visit_logs.sql").split(
      "CREATE OR REPLACE FUNCTION",
    )[0],
  );
  await db.exec(
    `ALTER TABLE site_visit_logs ADD COLUMN actor_type text NOT NULL DEFAULT 'visitor', ADD COLUMN is_automated boolean NOT NULL DEFAULT false;`,
  );
  await db.exec(readMigration("20260503000000_add_poster_view_logs.sql"));
  await db.exec(readMigration("20260502010000_add_poster_link_click_logs.sql"));
  await db.exec(
    readMigration("20260924020000_add_alert_cta_rpc_and_events.sql"),
  );
  await db.exec(
    readMigration("20261031010000_extend_product_events_for_retention.sql"),
  );
  await db.exec(readMigration("20261031020000_add_usage_log_retention.sql"));
  return db;
}
