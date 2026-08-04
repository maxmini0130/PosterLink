CREATE OR REPLACE FUNCTION get_site_visit_identity_overview(
  p_days INTEGER,
  p_include_internal BOOLEAN
)
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
      (
        date_trunc('day', now() AT TIME ZONE 'Asia/Seoul')
        - make_interval(days => GREATEST(COALESCE(p_days, 1), 1) - 1)
      ) AT TIME ZONE 'Asia/Seoul' AS period_start,
      date_trunc('day', now() AT TIME ZONE 'Asia/Seoul')
        AT TIME ZONE 'Asia/Seoul' AS today_start
  ),
  scoped_visits AS (
    SELECT visit.*
    FROM site_visit_logs AS visit
    LEFT JOIN profiles AS profile ON profile.id = visit.user_id
    WHERE
      p_include_internal
      OR (
        COALESCE(profile.role::text, '') NOT IN ('admin', 'super_admin', 'operator')
        AND COALESCE(visit.actor_type, 'visitor') NOT IN ('automation', 'bot')
        AND NOT COALESCE(visit.is_automated, false)
        AND visit.automation_source IS NULL
        AND COALESCE(visit.query_string, '') !~* '(^|[?&])_pl_automation='
        AND COALESCE(visit.user_agent, '') !~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot|headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
      )
  )
  SELECT
    COUNT(DISTINCT COALESCE(user_id::text, ip_hash, visitor_key)),
    COUNT(DISTINCT COALESCE(session_key, user_id::text, ip_hash, visitor_key)),
    COUNT(*),
    COUNT(DISTINCT COALESCE(user_id::text, ip_hash, visitor_key))
      FILTER (WHERE created_at >= bounds.period_start),
    COUNT(DISTINCT COALESCE(session_key, user_id::text, ip_hash, visitor_key))
      FILTER (WHERE created_at >= bounds.period_start),
    COUNT(*) FILTER (WHERE created_at >= bounds.period_start),
    COUNT(DISTINCT COALESCE(user_id::text, ip_hash, visitor_key))
      FILTER (WHERE created_at >= bounds.today_start),
    COUNT(*) FILTER (WHERE created_at >= bounds.today_start)
  FROM scoped_visits
  CROSS JOIN bounds;
$$;

REVOKE ALL ON FUNCTION get_site_visit_identity_overview(INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_site_visit_identity_overview(INTEGER, BOOLEAN) TO service_role;
