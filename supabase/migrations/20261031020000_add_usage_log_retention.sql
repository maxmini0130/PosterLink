-- Usage log retention (privacy policy draft, apps/web/app/privacy/policy.ts):
--   raw usage logs and visitor-account links: 3 calendar months in Asia/Seoul
--   search text (search_logs, site_visit_logs query/referrer URL): 30 days
-- Long-term comparison keeps only weekly cohort counts without any identifier.
--
-- This migration creates functions only; nothing is deleted when it is applied.
-- Check usage_log_retention_preview() first, then apply the separate schedule
-- migration (20261031030000_schedule_usage_log_retention.sql) after approval.

-- 1. Weekly cohort counts. No person keys, no breakdowns.
CREATE TABLE IF NOT EXISTS usage_weekly_cohorts (
  cohort_week DATE PRIMARY KEY,               -- Monday, Asia/Seoul
  new_people INTEGER NOT NULL,
  returned_7d INTEGER NOT NULL,
  returned_30d INTEGER NOT NULL,
  active_people INTEGER NOT NULL,             -- distinct people visiting that week
  lookback_complete BOOLEAN NOT NULL,         -- false if raw logs did not cover the lookback window
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usage_weekly_cohorts ENABLE ROW LEVEL SECURITY;
-- Only the retention job writes; server-side admin code may read.
REVOKE ALL ON TABLE usage_weekly_cohorts FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE usage_weekly_cohorts TO service_role;

-- Latest raw cutoff a run has applied: raw visits before it may be gone, so a
-- week whose 45-day lookback reaches past it cannot tell new from returning.
CREATE TABLE IF NOT EXISTS usage_log_retention_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  raw_purged_before TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usage_log_retention_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE usage_log_retention_state FROM anon, authenticated, service_role;

-- 2. Snapshot of finished cohorts. "New" means no visit in the previous 45 days,
-- because raw logs older than 3 months are gone: a cohort is snapshotted 37 days
-- after its week starts, when raw logs still reach about 52 days back.
-- Revisit rules follow docs/retention_metrics_20261031.md Q1.
CREATE OR REPLACE FUNCTION snapshot_usage_weekly_cohorts()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  WITH key_owner AS (
    SELECT DISTINCT ON (visitor_key) visitor_key, user_id
    FROM visitor_identity_links
    ORDER BY visitor_key, first_linked_at, user_id
  ),
  visits AS (
    SELECT
      v.created_at,
      (v.created_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day,
      COALESCE(v.user_id::text, ko.user_id::text, 'v:' || v.visitor_key) AS person
    FROM site_visit_logs v
    LEFT JOIN key_owner ko ON ko.visitor_key = v.visitor_key
    WHERE v.actor_type IN ('visitor', 'member') AND NOT v.is_automated
      AND v.created_at IS NOT NULL
  ),
  -- next_week: continue after the last stored week, so weeks keep being stored
  -- while raw logs are empty; only the very first run starts at the first visit.
  -- data_start: when collection began, kept by the oldest stored week once the
  -- raw rows of that time are purged.
  bounds AS (
    SELECT
      COALESCE(
        (SELECT max(cohort_week) + 7 FROM usage_weekly_cohorts),
        date_trunc('week', (SELECT min(kst_day) FROM visits))::date
      ) AS next_week,
      LEAST(
        (SELECT min(cohort_week)::timestamp AT TIME ZONE 'Asia/Seoul' FROM usage_weekly_cohorts),
        (SELECT min(created_at) FROM visits)
      ) AS data_start,
      (SELECT raw_purged_before FROM usage_log_retention_state) AS purged_before
  ),
  -- First visit of a person after a 45-day gap (or their first visit at all).
  starts AS (
    SELECT person, created_at AS first_at, kst_day AS first_day
    FROM (
      SELECT person, created_at, kst_day,
        lag(created_at) OVER (PARTITION BY person ORDER BY created_at) AS prev_at
      FROM visits
    ) s
    WHERE prev_at IS NULL OR prev_at < created_at - interval '45 days'
  ),
  flags AS (
    SELECT
      s.person,
      s.first_at,
      date_trunc('week', s.first_day)::date AS cohort_week,
      COALESCE(bool_or(v.kst_day > s.first_day
                       AND v.created_at < s.first_at + interval '7 days'), false) AS r7,
      COALESCE(bool_or(v.kst_day > s.first_day
                       AND v.created_at < s.first_at + interval '30 days'), false) AS r30
    FROM starts s
    LEFT JOIN visits v
      ON v.person = s.person
     AND v.created_at > s.first_at
     AND v.created_at < s.first_at + interval '30 days'
    GROUP BY s.person, s.first_at, s.first_day
  ),
  -- Every week since collection began, including weeks with no new people or no
  -- visits at all, so a missing row always means "not computed", never zero.
  -- A week is final once every person starting in it has had 30 days to return.
  -- With no stored week and no raw visit yet, there is nothing to start from.
  weeks AS (
    SELECT w::date AS cohort_week
    FROM bounds,
      generate_series(
        next_week,
        (now() AT TIME ZONE 'Asia/Seoul')::date,
        interval '1 week'
      ) AS w
    WHERE ((w::date + 7)::timestamp AT TIME ZONE 'Asia/Seoul') + interval '30 days' <= now()
  ),
  cohorts AS (
    SELECT
      cohort_week,
      count(*) AS new_people,
      count(*) FILTER (WHERE r7) AS returned_7d,
      count(*) FILTER (WHERE r30) AS returned_30d
    FROM flags
    GROUP BY cohort_week
  ),
  active AS (
    SELECT date_trunc('week', kst_day)::date AS cohort_week, count(DISTINCT person) AS n
    FROM visits
    GROUP BY 1
  ),
  inserted AS (
    INSERT INTO usage_weekly_cohorts (
      cohort_week, new_people, returned_7d, returned_30d, active_people, lookback_complete
    )
    SELECT
      w.cohort_week,
      COALESCE(c.new_people, 0)::int,
      COALESCE(c.returned_7d, 0)::int,
      COALESCE(c.returned_30d, 0)::int,
      COALESCE(a.n, 0)::int,
      (w.cohort_week::timestamp AT TIME ZONE 'Asia/Seoul') - interval '45 days' >= b.data_start
        AND (b.purged_before IS NULL
             OR (w.cohort_week::timestamp AT TIME ZONE 'Asia/Seoul') - interval '45 days' >= b.purged_before)
    FROM weeks w
    CROSS JOIN bounds b
    LEFT JOIN cohorts c USING (cohort_week)
    LEFT JOIN active a USING (cohort_week)
    ON CONFLICT (cohort_week) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;
  RETURN v_inserted;
END;
$$;

-- 3. Cutoffs. Calendar months in Asia/Seoul, not 90 days.
CREATE OR REPLACE FUNCTION usage_log_retention_cutoffs(
  OUT raw_cutoff TIMESTAMPTZ,
  OUT search_cutoff TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    ((now() AT TIME ZONE 'Asia/Seoul') - interval '3 months') AT TIME ZONE 'Asia/Seoul',
    now() - interval '30 days';
$$;

-- 4. Dry run: rows each step would touch now, without a batch limit.
CREATE OR REPLACE FUNCTION usage_log_retention_preview()
RETURNS TABLE (target TEXT, action TEXT, cutoff TIMESTAMPTZ, rows BIGINT)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c RECORD;
BEGIN
  SELECT * INTO c FROM usage_log_retention_cutoffs();
  RETURN QUERY
    SELECT 'site_visit_logs', 'delete', c.raw_cutoff,
      (SELECT count(*) FROM site_visit_logs WHERE created_at < c.raw_cutoff)
    UNION ALL
    SELECT 'site_visit_logs', 'clear query_string/referrer_url', c.search_cutoff,
      (SELECT count(*) FROM site_visit_logs
       WHERE created_at < c.search_cutoff AND created_at >= c.raw_cutoff
         AND (query_string IS NOT NULL OR referrer_url IS NOT NULL))
    UNION ALL
    SELECT 'poster_view_logs', 'delete', c.raw_cutoff,
      (SELECT count(*) FROM poster_view_logs WHERE created_at < c.raw_cutoff)
    UNION ALL
    SELECT 'poster_link_click_logs', 'delete', c.raw_cutoff,
      (SELECT count(*) FROM poster_link_click_logs WHERE created_at < c.raw_cutoff)
    UNION ALL
    SELECT 'product_events', 'delete', c.raw_cutoff,
      (SELECT count(*) FROM product_events WHERE created_at < c.raw_cutoff)
    UNION ALL
    SELECT 'search_logs', 'delete', c.search_cutoff,
      (SELECT count(*) FROM search_logs WHERE created_at < c.search_cutoff)
    UNION ALL
    SELECT 'visitor_identity_links', 'delete', c.raw_cutoff,
      (SELECT count(*) FROM visitor_identity_links l
       WHERE l.last_linked_at < c.raw_cutoff
         AND NOT EXISTS (SELECT 1 FROM site_visit_logs v
                         WHERE v.visitor_key = l.visitor_key AND v.created_at >= c.raw_cutoff)
         AND NOT EXISTS (SELECT 1 FROM product_events e
                         WHERE e.visitor_key = l.visitor_key AND e.created_at >= c.raw_cutoff))
    UNION ALL
    SELECT 'usage_weekly_cohorts', 'snapshot (weeks not stored yet)', NULL::timestamptz,
      NULL::bigint;
END;
$$;

-- 5. One run: snapshot first, then purge at most p_batch rows per step, so a
-- large backlog drains over several daily runs. Runs in one transaction; if the
-- snapshot fails, nothing is deleted.
CREATE OR REPLACE FUNCTION run_usage_log_retention(p_batch INTEGER DEFAULT 50000)
RETURNS TABLE (target TEXT, action TEXT, rows BIGINT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c RECORD;
  n BIGINT;
BEGIN
  IF p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'invalid batch size' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM usage_log_retention_cutoffs();

  target := 'usage_weekly_cohorts'; action := 'snapshot';
  rows := snapshot_usage_weekly_cohorts(); RETURN NEXT;

  -- After the snapshot, so it judged lookbacks against the previous cutoff.
  INSERT INTO usage_log_retention_state AS s (singleton, raw_purged_before)
  VALUES (true, c.raw_cutoff)
  ON CONFLICT (singleton) DO UPDATE
    SET raw_purged_before = GREATEST(s.raw_purged_before, EXCLUDED.raw_purged_before),
        updated_at = now();

  DELETE FROM site_visit_logs WHERE ctid = ANY (ARRAY(
    SELECT ctid FROM site_visit_logs WHERE created_at < c.raw_cutoff LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'site_visit_logs'; action := 'delete'; rows := n; RETURN NEXT;

  UPDATE site_visit_logs SET query_string = NULL, referrer_url = NULL
  WHERE ctid = ANY (ARRAY(
    SELECT ctid FROM site_visit_logs
    WHERE created_at < c.search_cutoff AND created_at >= c.raw_cutoff
      AND (query_string IS NOT NULL OR referrer_url IS NOT NULL)
    LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'site_visit_logs'; action := 'clear query_string/referrer_url'; rows := n; RETURN NEXT;

  DELETE FROM poster_view_logs WHERE ctid = ANY (ARRAY(
    SELECT ctid FROM poster_view_logs WHERE created_at < c.raw_cutoff LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'poster_view_logs'; action := 'delete'; rows := n; RETURN NEXT;

  DELETE FROM poster_link_click_logs WHERE ctid = ANY (ARRAY(
    SELECT ctid FROM poster_link_click_logs WHERE created_at < c.raw_cutoff LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'poster_link_click_logs'; action := 'delete'; rows := n; RETURN NEXT;

  DELETE FROM product_events WHERE ctid = ANY (ARRAY(
    SELECT ctid FROM product_events WHERE created_at < c.raw_cutoff LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'product_events'; action := 'delete'; rows := n; RETURN NEXT;

  DELETE FROM search_logs WHERE ctid = ANY (ARRAY(
    SELECT ctid FROM search_logs WHERE created_at < c.search_cutoff LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'search_logs'; action := 'delete'; rows := n; RETURN NEXT;

  -- A link stays while its browser key still has visits or events in the window.
  DELETE FROM visitor_identity_links l WHERE ctid = ANY (ARRAY(
    SELECT l2.ctid FROM visitor_identity_links l2
    WHERE l2.last_linked_at < c.raw_cutoff
      AND NOT EXISTS (SELECT 1 FROM site_visit_logs v
                      WHERE v.visitor_key = l2.visitor_key AND v.created_at >= c.raw_cutoff)
      AND NOT EXISTS (SELECT 1 FROM product_events e
                      WHERE e.visitor_key = l2.visitor_key AND e.created_at >= c.raw_cutoff)
    LIMIT p_batch));
  GET DIAGNOSTICS n = ROW_COUNT;
  target := 'visitor_identity_links'; action := 'delete'; rows := n; RETURN NEXT;
END;
$$;

-- Database owner (pg_cron) only. Supabase grants new functions to the API roles
-- by default, so revoke explicitly: these must never be callable over PostgREST.
REVOKE ALL ON FUNCTION snapshot_usage_weekly_cohorts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION usage_log_retention_cutoffs() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION usage_log_retention_preview() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION run_usage_log_retention(INTEGER) FROM PUBLIC, anon, authenticated, service_role;

-- Rollback (manual, after approval; deleted rows cannot be restored):
--   DROP FUNCTION IF EXISTS run_usage_log_retention(INTEGER);
--   DROP FUNCTION IF EXISTS usage_log_retention_preview();
--   DROP FUNCTION IF EXISTS usage_log_retention_cutoffs();
--   DROP FUNCTION IF EXISTS snapshot_usage_weekly_cohorts();
--   DROP TABLE IF EXISTS usage_log_retention_state;
--   DROP TABLE IF EXISTS usage_weekly_cohorts;  -- only after exporting the rows
