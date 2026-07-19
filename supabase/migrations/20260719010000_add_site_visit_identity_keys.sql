ALTER TABLE site_visit_logs
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_user_created
  ON site_visit_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_ip_hash_created
  ON site_visit_logs(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION get_site_visit_identity_overview(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  total_visitors BIGINT,
  total_sessions BIGINT,
  total_pageviews BIGINT,
  period_visitors BIGINT,
  period_sessions BIGINT,
  period_pageviews BIGINT,
  today_visitors BIGINT,
  today_pageviews BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1)) AS period_start,
      date_trunc('day', now()) AS today_start
  )
  SELECT
    (SELECT COUNT(DISTINCT COALESCE(user_id::text, ip_hash, visitor_key)) FROM site_visit_logs),
    (SELECT COUNT(DISTINCT COALESCE(session_key, user_id::text, ip_hash, visitor_key)) FROM site_visit_logs),
    (SELECT COUNT(*) FROM site_visit_logs),
    (
      SELECT COUNT(DISTINCT COALESCE(user_id::text, ip_hash, visitor_key))
      FROM site_visit_logs, bounds
      WHERE created_at >= bounds.period_start
    ),
    (
      SELECT COUNT(DISTINCT COALESCE(session_key, user_id::text, ip_hash, visitor_key))
      FROM site_visit_logs, bounds
      WHERE created_at >= bounds.period_start
    ),
    (SELECT COUNT(*) FROM site_visit_logs, bounds WHERE created_at >= bounds.period_start),
    (
      SELECT COUNT(DISTINCT COALESCE(user_id::text, ip_hash, visitor_key))
      FROM site_visit_logs, bounds
      WHERE created_at >= bounds.today_start
    ),
    (SELECT COUNT(*) FROM site_visit_logs, bounds WHERE created_at >= bounds.today_start);
$$;

REVOKE ALL ON FUNCTION get_site_visit_identity_overview(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_site_visit_identity_overview(INTEGER) TO service_role;
