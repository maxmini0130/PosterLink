-- Read-only comparison of the production database with the retention stage 0
-- migrations of PR #16, to run right before merging it:
--   20261031010000_extend_product_events_for_retention.sql
--   20261031020000_add_usage_log_retention.sql
--   20261031030000_schedule_usage_log_retention.sql
-- Everything runs in a READ ONLY transaction that is rolled back: nothing can
-- be written. Run it in psql and keep the output (the dashboard SQL editor
-- shows only the last result; there, run one numbered section at a time
-- between BEGIN TRANSACTION READ ONLY; and ROLLBACK;). An error such as
-- "does not exist" means that object is missing: report it; the statements
-- after it in the same transaction then fail too.
-- Each query names what it expects; any difference is reported before merging.

BEGIN TRANSACTION READ ONLY;

-- 1. Purge schedule (job 7) and its runs. Expect one active job
--    'usage-log-retention-daily', '30 18 * * *', and the first run of
--    2026-11-01 03:30 KST (18:30 UTC) and later ones 'succeeded'.
SELECT jobid, jobname, schedule, command, active
  FROM cron.job WHERE jobname = 'usage-log-retention-daily';
SELECT d.runid, d.status, d.start_time, d.end_time, left(d.return_message, 200) AS return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'usage-log-retention-daily'
 ORDER BY d.start_time DESC
 LIMIT 10;

-- 2. Weekly cohorts were stored before raw logs were purged.
--    Expect: state row present (collection_started_at around 2026-07-19 00:34 KST,
--    raw_purged_before set after the first run), cohorts from mid-July, and
--    no missing week between the first and last stored week.
SELECT collection_started_at, raw_purged_before, updated_at FROM public.usage_log_retention_state;
SELECT min(cohort_week) AS first_week, max(cohort_week) AS last_week, count(*) AS weeks,
       count(*) FILTER (WHERE NOT lookback_complete) AS incomplete_weeks
  FROM public.usage_weekly_cohorts;
SELECT w::date AS missing_week
  FROM generate_series((SELECT min(cohort_week) FROM public.usage_weekly_cohorts),
                       (SELECT max(cohort_week) FROM public.usage_weekly_cohorts),
                       interval '7 days') w
 WHERE NOT EXISTS (SELECT 1 FROM public.usage_weekly_cohorts c WHERE c.cohort_week = w::date);
--    After the first run the dry run should be near zero for every target.
SELECT * FROM public.usage_log_retention_preview();

-- 3. Functions: body identical to the migration files (md5 of the text between
--    the dollar quotes, line endings ignored). Expect body_matches = true for all
--    six and one row per name (no stray overloads).
SELECT p.proname, p.oid::regprocedure AS signature, p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner,
       md5(replace(p.prosrc, E'\r', '')) = e.body_md5 AS body_matches
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  RIGHT JOIN (VALUES
    ('record_product_event', '9e9d169d21595a4cf8b8adad851ce091'),
    ('link_visitor_identity', '2e973c9f8d026288e822714f5bb47b8e'),
    ('snapshot_usage_weekly_cohorts', '285799e849051c9a61ef03f85cda9f56'),
    ('usage_log_retention_cutoffs', 'fd4deebb79d43544000d1574917597ad'),
    ('usage_log_retention_preview', 'be38ea86be5f9f55cf252068bdccfb45'),
    ('run_usage_log_retention', '8ec0d9b4753a6a464fb7d4a20c189508')
  ) e(name, body_md5) ON e.name = p.proname
 ORDER BY e.name, signature;

-- 4. Function privileges. Expect:
--    record_product_event: anon true, authenticated true
--    link_visitor_identity: anon false, authenticated true
--    the four retention functions: anon, authenticated, service_role all false
SELECT f, r,
       has_function_privilege(r, f, 'EXECUTE') AS can_execute
  FROM unnest(ARRAY[
         'public.record_product_event(text, text, text, text, uuid, uuid, jsonb)',
         'public.link_visitor_identity(text, text, text, text, text)',
         'public.snapshot_usage_weekly_cohorts()',
         'public.usage_log_retention_cutoffs()',
         'public.usage_log_retention_preview()',
         'public.run_usage_log_retention(integer)']) f,
       unnest(ARRAY['anon', 'authenticated', 'service_role']) r
 ORDER BY f, r;

-- 5. Table privileges and RLS. Expect:
--    visitor_identity_links: anon/authenticated no rights, RLS on
--    usage_weekly_cohorts: only service_role SELECT, RLS on
--    usage_log_retention_state: no rights for the three roles, RLS on
SELECT t, r,
       has_table_privilege(r, t, 'SELECT') AS can_select,
       has_table_privilege(r, t, 'INSERT,UPDATE,DELETE') AS can_write
  FROM unnest(ARRAY['public.visitor_identity_links', 'public.usage_weekly_cohorts',
                    'public.usage_log_retention_state']) t,
       unnest(ARRAY['anon', 'authenticated', 'service_role']) r
 ORDER BY t, r;
SELECT c.relname, c.relrowsecurity AS rls_on
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE c.relname IN ('visitor_identity_links', 'usage_weekly_cohorts', 'usage_log_retention_state');

-- 6. Columns and constraints added by 20261031010000. Expect the five
--    product_events columns, poster_view_logs.source, and the four checks.
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'product_events'
         AND column_name IN ('user_id', 'visitor_key', 'session_key', 'client', 'institution_id'))
        OR (table_name = 'poster_view_logs' AND column_name = 'source'))
 ORDER BY table_name, column_name;
SELECT conname
  FROM pg_constraint
 WHERE conname IN ('product_events_event_name_check', 'product_events_alert_fields_check',
                   'product_events_client_check', 'poster_view_logs_source_check')
 ORDER BY conname;

-- 7. Migration history, if migrations were recorded by the Supabase CLI.
--    NULL here means they were applied by hand; then sections 3-6 are the record.
SELECT to_regclass('supabase_migrations.schema_migrations') AS history_table;
ROLLBACK;

-- Only when history_table above is not NULL (a separate read-only statement):
-- BEGIN TRANSACTION READ ONLY;
-- SELECT version, name FROM supabase_migrations.schema_migrations
--  WHERE version >= '20261031' ORDER BY version;
-- ROLLBACK;
