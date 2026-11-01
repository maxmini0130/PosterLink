-- Read-only comparison of the production database with the retention stage 0
-- migrations of PR #16, to run right before merging it:
--   20261031010000_extend_product_events_for_retention.sql
--   20261031020000_add_usage_log_retention.sql
--   20261031030000_schedule_usage_log_retention.sql
-- Everything runs in a READ ONLY transaction that is rolled back: nothing can
-- be written. Run it in psql and keep the output (the dashboard SQL editor
-- shows only the last result). An error such as "does not exist" means that
-- object is missing: report it; later statements in the transaction then fail.
--
-- Section 3 is the verdict: one row per check with ok, actual and expected.
-- Every row must be ok = true. The expected definitions were produced by these
-- migrations in PGlite (scripts/retention/pre-merge-readonly-check.test.ts keeps
-- them in step); if a constraint or index differs only in how the server
-- prints it, compare actual and expected by eye and report it.

BEGIN TRANSACTION READ ONLY;

-- 1. For the record: the purge schedule and its last runs.
SELECT jobid, jobname, schedule, command, active
  FROM cron.job WHERE jobname = 'usage-log-retention-daily';
SELECT d.runid, d.status, d.start_time, d.end_time, left(d.return_message, 200) AS return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'usage-log-retention-daily'
 ORDER BY d.start_time DESC
 LIMIT 10;

-- 2. For the record: retention state, stored weeks and the dry run (rows that
--    expired since the last run are expected; the snapshot row is always NULL).
SELECT collection_started_at, raw_purged_before, updated_at FROM public.usage_log_retention_state;
SELECT min(cohort_week) AS first_week, max(cohort_week) AS last_week, count(*) AS weeks,
       count(*) FILTER (WHERE NOT lookback_complete) AS incomplete_weeks
  FROM public.usage_weekly_cohorts;
SELECT * FROM public.usage_log_retention_preview();

-- 3. Verdict.
WITH
expected_functions(sig, body_md5, lang, secdef, config) AS (VALUES
  ('record_product_event(text,text,text,text,uuid,uuid,jsonb)', '9e9d169d21595a4cf8b8adad851ce091', 'plpgsql', true, '{search_path=public}'),
  ('link_visitor_identity(text,text,text,text,text)', '2e973c9f8d026288e822714f5bb47b8e', 'plpgsql', true, '{"search_path=public, auth"}'),
  ('snapshot_usage_weekly_cohorts()', '285799e849051c9a61ef03f85cda9f56', 'plpgsql', false, '{search_path=public}'),
  ('usage_log_retention_cutoffs()', 'fd4deebb79d43544000d1574917597ad', 'sql', false, '{search_path=public}'),
  ('usage_log_retention_preview()', 'be38ea86be5f9f55cf252068bdccfb45', 'plpgsql', false, '{search_path=public}'),
  ('run_usage_log_retention(integer)', '8ec0d9b4753a6a464fb7d4a20c189508', 'plpgsql', false, '{search_path=public}')
),
functions AS (
  SELECT p.oid::regprocedure::text AS sig, p.proname,
         md5(replace(p.prosrc, E'\r', '')) AS body_md5, l.lanname AS lang,
         p.prosecdef AS secdef, p.proconfig::text AS config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    JOIN pg_language l ON l.oid = p.prolang
),
expected_constraints(tbl, conname, def) AS (VALUES
  ('product_events', 'product_events_event_name_check', 'CHECK ((event_name = ANY (ARRAY[''alert_cta_view''::text, ''alert_cta_click''::text, ''auth_modal_view''::text, ''login_complete''::text, ''alert_saved''::text, ''notification_sent''::text, ''notification_open''::text, ''favorite_add''::text, ''favorite_remove''::text, ''institution_follow''::text, ''institution_unfollow''::text, ''interest_save''::text, ''apply_status_set''::text, ''share_click''::text, ''signup_prompt_shown''::text, ''signup_start''::text, ''signup_complete''::text, ''guest_merge''::text])))'),
  ('product_events', 'product_events_alert_fields_check', 'CHECK (((event_name <> ALL (ARRAY[''alert_cta_view''::text, ''alert_cta_click''::text, ''auth_modal_view''::text, ''login_complete''::text, ''alert_saved''::text, ''notification_sent''::text, ''notification_open''::text])) OR ((poster_status IS NOT NULL) AND (region IS NOT NULL) AND (category IS NOT NULL) AND (cta_variant IS NOT NULL))))'),
  ('product_events', 'product_events_client_check', 'CHECK (((client IS NULL) OR (client = ANY (ARRAY[''web''::text, ''app''::text]))))'),
  ('product_events', 'product_events_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL'),
  ('product_events', 'product_events_institution_id_fkey', 'FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL'),
  ('poster_view_logs', 'poster_view_logs_source_check', 'CHECK (((source IS NULL) OR (source = ANY (ARRAY[''search''::text, ''home''::text, ''related''::text, ''institution''::text, ''favorites''::text, ''list''::text, ''notification''::text, ''share''::text, ''external''::text, ''direct''::text, ''other''::text]))))'),
  ('visitor_identity_links', 'visitor_identity_links_pkey', 'PRIMARY KEY (visitor_key, user_id)'),
  ('visitor_identity_links', 'visitor_identity_links_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
  ('visitor_identity_links', 'visitor_identity_links_client_check', 'CHECK ((client = ANY (ARRAY[''web''::text, ''app''::text])))'),
  ('visitor_identity_links', 'visitor_identity_links_visitor_key_check', 'CHECK (((char_length(visitor_key) >= 8) AND (char_length(visitor_key) <= 120)))'),
  ('usage_weekly_cohorts', 'usage_weekly_cohorts_pkey', 'PRIMARY KEY (cohort_week)'),
  ('usage_log_retention_state', 'usage_log_retention_state_pkey', 'PRIMARY KEY (singleton)'),
  ('usage_log_retention_state', 'usage_log_retention_state_singleton_check', 'CHECK (singleton)')
),
expected_indexes(idx, def, is_unique) AS (VALUES
  ('product_events_signup_complete_once', 'CREATE UNIQUE INDEX product_events_signup_complete_once ON public.product_events USING btree (user_id) WHERE (event_name = ''signup_complete''::text)', true),
  ('product_events_visitor_created_at', 'CREATE INDEX product_events_visitor_created_at ON public.product_events USING btree (visitor_key, created_at DESC) WHERE (visitor_key IS NOT NULL)', false),
  ('product_events_user_created_at', 'CREATE INDEX product_events_user_created_at ON public.product_events USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL)', false),
  ('visitor_identity_links_user', 'CREATE INDEX visitor_identity_links_user ON public.visitor_identity_links USING btree (user_id, first_linked_at)', false)
),
expected_function_rights(fn, role, can_execute) AS (VALUES
  ('public.record_product_event(text, text, text, text, uuid, uuid, jsonb)', 'anon', true),
  ('public.record_product_event(text, text, text, text, uuid, uuid, jsonb)', 'authenticated', true),
  ('public.link_visitor_identity(text, text, text, text, text)', 'anon', false),
  ('public.link_visitor_identity(text, text, text, text, text)', 'authenticated', true),
  ('public.snapshot_usage_weekly_cohorts()', 'anon', false),
  ('public.snapshot_usage_weekly_cohorts()', 'authenticated', false),
  ('public.snapshot_usage_weekly_cohorts()', 'service_role', false),
  ('public.usage_log_retention_cutoffs()', 'anon', false),
  ('public.usage_log_retention_cutoffs()', 'authenticated', false),
  ('public.usage_log_retention_cutoffs()', 'service_role', false),
  ('public.usage_log_retention_preview()', 'anon', false),
  ('public.usage_log_retention_preview()', 'authenticated', false),
  ('public.usage_log_retention_preview()', 'service_role', false),
  ('public.run_usage_log_retention(integer)', 'anon', false),
  ('public.run_usage_log_retention(integer)', 'authenticated', false),
  ('public.run_usage_log_retention(integer)', 'service_role', false)
),
expected_table_rights(tbl, role, can_select, can_write) AS (VALUES
  ('public.visitor_identity_links', 'anon', false, false),
  ('public.visitor_identity_links', 'authenticated', false, false),
  ('public.usage_weekly_cohorts', 'anon', false, false),
  ('public.usage_weekly_cohorts', 'authenticated', false, false),
  ('public.usage_weekly_cohorts', 'service_role', true, false),
  ('public.usage_log_retention_state', 'anon', false, false),
  ('public.usage_log_retention_state', 'authenticated', false, false),
  ('public.usage_log_retention_state', 'service_role', false, false)
),
expected_columns(tbl, col, data_type) AS (VALUES
  ('product_events', 'user_id', 'uuid'),
  ('product_events', 'visitor_key', 'text'),
  ('product_events', 'session_key', 'text'),
  ('product_events', 'client', 'text'),
  ('product_events', 'institution_id', 'uuid'),
  ('poster_view_logs', 'source', 'text')
),
-- Weekly cohorts: every week whose 30-day return window had closed by the
-- last successful run must be stored (same KST week and closing rule as
-- snapshot_usage_weekly_cohorts), from the first stored week, which may not be
-- before the week collection started.
last_run AS (
  SELECT max(d.start_time) AS at
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
   WHERE j.jobname = 'usage-log-retention-daily' AND d.status = 'succeeded'
),
cohort_bounds AS (
  SELECT
    r.at AS last_run_at,
    s.collection_started_at,
    date_trunc('week', (s.collection_started_at AT TIME ZONE 'Asia/Seoul')::date)::date AS start_week,
    (SELECT min(cohort_week) FROM public.usage_weekly_cohorts) AS first_stored,
    (SELECT max(w)::date
       FROM generate_series(
              date_trunc('week', (s.collection_started_at AT TIME ZONE 'Asia/Seoul')::date),
              (r.at AT TIME ZONE 'Asia/Seoul')::date,
              interval '1 week') w
      WHERE ((w::date + 7)::timestamp AT TIME ZONE 'Asia/Seoul') + interval '30 days' <= r.at) AS last_due
  FROM last_run r
  LEFT JOIN public.usage_log_retention_state s ON true
),
missing_weeks AS (
  SELECT w::date AS week
    FROM cohort_bounds b,
         generate_series(coalesce(b.first_stored, b.start_week), b.last_due, interval '1 week') w
   WHERE NOT EXISTS (SELECT 1 FROM public.usage_weekly_cohorts c WHERE c.cohort_week = w::date)
),
checks(section, item, ok, actual, expected) AS (
  SELECT 'job', 'usage-log-retention-daily',
         coalesce(bool_and(j.active AND j.schedule = '30 18 * * *'
                           AND j.command LIKE '%public.run_usage_log_retention(50000)%'), false),
         string_agg(j.schedule || ' | ' || j.active || ' | ' || j.command, ' ; '),
         '30 18 * * * | true | select * from public.run_usage_log_retention(50000);'
    FROM (SELECT 1) one LEFT JOIN cron.job j ON j.jobname = 'usage-log-retention-daily'
  UNION ALL
  SELECT 'function', e.sig,
         coalesce(f.body_md5 = e.body_md5 AND f.lang = e.lang AND f.secdef = e.secdef
                  AND f.config IS NOT DISTINCT FROM e.config, false),
         concat_ws(' | ', f.body_md5, f.lang, f.secdef, f.config),
         concat_ws(' | ', e.body_md5, e.lang, e.secdef, e.config)
    FROM expected_functions e LEFT JOIN functions f ON f.sig = e.sig
  UNION ALL
  SELECT 'function', 'no other overloads', count(*) = 6, count(*)::text, '6'
    FROM functions
   WHERE proname IN ('record_product_event', 'link_visitor_identity', 'snapshot_usage_weekly_cohorts',
                     'usage_log_retention_cutoffs', 'usage_log_retention_preview', 'run_usage_log_retention')
  UNION ALL
  SELECT 'constraint', e.tbl || '.' || e.conname, coalesce(pg_get_constraintdef(c.oid) = e.def, false),
         pg_get_constraintdef(c.oid), e.def
    FROM expected_constraints e
    LEFT JOIN pg_constraint c
      ON c.conname = e.conname AND c.conrelid = to_regclass('public.' || e.tbl)
  UNION ALL
  SELECT 'index', e.idx,
         coalesce(pg_get_indexdef(i.indexrelid) = e.def AND i.indisunique = e.is_unique AND i.indisvalid, false),
         concat_ws(' | ', pg_get_indexdef(i.indexrelid), 'unique=' || i.indisunique, 'valid=' || i.indisvalid),
         concat_ws(' | ', e.def, 'unique=' || e.is_unique, 'valid=true')
    FROM expected_indexes e
    LEFT JOIN pg_index i ON i.indexrelid = to_regclass('public.' || e.idx)
  UNION ALL
  SELECT 'function right', e.fn || ' / ' || e.role,
         has_function_privilege(e.role, e.fn, 'EXECUTE') = e.can_execute,
         has_function_privilege(e.role, e.fn, 'EXECUTE')::text, e.can_execute::text
    FROM expected_function_rights e
  UNION ALL
  SELECT 'table right', e.tbl || ' / ' || e.role,
         has_table_privilege(e.role, e.tbl, 'SELECT') = e.can_select
           AND has_table_privilege(e.role, e.tbl, 'INSERT,UPDATE,DELETE') = e.can_write,
         'select=' || has_table_privilege(e.role, e.tbl, 'SELECT')
           || ' write=' || has_table_privilege(e.role, e.tbl, 'INSERT,UPDATE,DELETE'),
         'select=' || e.can_select || ' write=' || e.can_write
    FROM expected_table_rights e
  UNION ALL
  SELECT 'rls', t.tbl, coalesce(c.relrowsecurity, false), coalesce(c.relrowsecurity::text, 'missing'), 'true'
    FROM (VALUES ('visitor_identity_links'), ('usage_weekly_cohorts'), ('usage_log_retention_state')) t(tbl)
    LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.tbl)
  UNION ALL
  SELECT 'column', e.tbl || '.' || e.col, coalesce(c.data_type = e.data_type, false),
         coalesce(c.data_type, 'missing'), e.data_type
    FROM expected_columns e
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = e.tbl AND c.column_name = e.col
  UNION ALL
  SELECT 'cohort', 'a successful run exists', b.last_run_at IS NOT NULL,
         coalesce(b.last_run_at::text, 'none'), 'a succeeded run of usage-log-retention-daily'
    FROM cohort_bounds b
  UNION ALL
  SELECT 'cohort', 'collection start recorded', b.collection_started_at IS NOT NULL,
         coalesce(b.collection_started_at::text, 'missing'), 'usage_log_retention_state.collection_started_at'
    FROM cohort_bounds b
  UNION ALL
  SELECT 'cohort', 'first stored week not before collection started',
         b.first_stored IS NULL OR b.first_stored >= b.start_week,
         coalesce(b.first_stored::text, 'none'), '>= ' || coalesce(b.start_week::text, '?')
    FROM cohort_bounds b
  UNION ALL
  SELECT 'cohort', 'every closed week stored up to the last run',
         b.last_run_at IS NOT NULL AND b.collection_started_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM missing_weeks),
         'missing ' || (SELECT count(*) FROM missing_weeks) || ', last due ' || coalesce(b.last_due::text, 'none'),
         'missing 0'
    FROM cohort_bounds b
  UNION ALL
  SELECT 'cohort', 'missing week ' || m.week, false, 'not stored', 'stored'
    FROM missing_weeks m
)
SELECT section, item, ok, actual, expected
  FROM checks
 ORDER BY ok, section, item;

-- 4. Migration history, if migrations were recorded by the Supabase CLI.
--    NULL here means they were applied by hand; then section 3 is the record.
SELECT to_regclass('supabase_migrations.schema_migrations') AS history_table;
ROLLBACK;

-- Only when history_table above is not NULL (a separate read-only statement):
-- BEGIN TRANSACTION READ ONLY;
-- SELECT version, name FROM supabase_migrations.schema_migrations
--  WHERE version >= '20261031' ORDER BY version;
-- ROLLBACK;
