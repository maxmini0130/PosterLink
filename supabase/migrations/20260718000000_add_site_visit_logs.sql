CREATE TABLE IF NOT EXISTS site_visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  visitor_key TEXT NOT NULL,
  session_key TEXT,
  path TEXT NOT NULL,
  query_string TEXT,
  referrer_url TEXT,
  referrer_host TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_created
  ON site_visit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_visitor_created
  ON site_visit_logs(visitor_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_session_created
  ON site_visit_logs(session_key, created_at DESC)
  WHERE session_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_path_created
  ON site_visit_logs(path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_referrer_host_created
  ON site_visit_logs(referrer_host, created_at DESC)
  WHERE referrer_host IS NOT NULL;

ALTER TABLE site_visit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_visit_logs_insert" ON site_visit_logs;
CREATE POLICY "site_visit_logs_insert"
  ON site_visit_logs
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "site_visit_logs_select_admin" ON site_visit_logs;
CREATE POLICY "site_visit_logs_select_admin"
  ON site_visit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE OR REPLACE FUNCTION get_site_visit_overview(p_days INTEGER DEFAULT 30)
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
    (SELECT COUNT(DISTINCT visitor_key) FROM site_visit_logs),
    (SELECT COUNT(DISTINCT COALESCE(session_key, visitor_key)) FROM site_visit_logs),
    (SELECT COUNT(*) FROM site_visit_logs),
    (SELECT COUNT(DISTINCT visitor_key) FROM site_visit_logs, bounds WHERE created_at >= bounds.period_start),
    (SELECT COUNT(DISTINCT COALESCE(session_key, visitor_key)) FROM site_visit_logs, bounds WHERE created_at >= bounds.period_start),
    (SELECT COUNT(*) FROM site_visit_logs, bounds WHERE created_at >= bounds.period_start),
    (SELECT COUNT(DISTINCT visitor_key) FROM site_visit_logs, bounds WHERE created_at >= bounds.today_start),
    (SELECT COUNT(*) FROM site_visit_logs, bounds WHERE created_at >= bounds.today_start);
$$;

REVOKE ALL ON FUNCTION get_site_visit_overview(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_site_visit_overview(INTEGER) TO service_role;
