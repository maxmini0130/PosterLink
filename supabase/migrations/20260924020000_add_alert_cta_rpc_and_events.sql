-- Closed-poster CTA save API, low-frequency fallback resolver, and anonymous
-- product event sink for server-side notification delivery events.

CREATE TABLE product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL CHECK (event_name IN (
    'alert_cta_view',
    'alert_cta_click',
    'auth_modal_view',
    'login_complete',
    'alert_saved',
    'notification_sent',
    'notification_open'
  )),
  poster_id UUID REFERENCES posters(id) ON DELETE SET NULL,
  poster_status TEXT NOT NULL,
  region TEXT NOT NULL,
  category TEXT NOT NULL,
  cta_variant TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX product_events_name_created_at
  ON product_events (event_name, created_at DESC);

CREATE INDEX product_events_poster_created_at
  ON product_events (poster_id, created_at DESC);

ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE product_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION resolve_closed_poster_alert_default(
  p_region_id UUID,
  p_category_id UUID
)
RETURNS TABLE (
  out_region_id UUID,
  out_region_name TEXT,
  out_category_id UUID,
  out_category_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_region regions%ROWTYPE;
  v_parent regions%ROWTYPE;
  v_category_name TEXT;
  v_recent_count BIGINT := 0;
BEGIN
  IF p_region_id IS NULL AND p_category_id IS NULL THEN
    RETURN;
  END IF;

  IF p_region_id IS NOT NULL THEN
    SELECT * INTO v_region FROM regions WHERE id = p_region_id;
  END IF;
  IF p_category_id IS NOT NULL THEN
    SELECT name INTO v_category_name FROM categories WHERE id = p_category_id;
  END IF;

  IF p_region_id IS NOT NULL AND p_category_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT poster.id) INTO v_recent_count
    FROM posters poster
    JOIN poster_regions poster_region ON poster_region.poster_id = poster.id
    JOIN poster_categories poster_category ON poster_category.poster_id = poster.id
    WHERE poster.created_at >= now() - interval '90 days'
      AND poster.poster_status IN ('published', 'closed')
      AND poster_region.region_id = p_region_id
      AND poster_category.category_id = p_category_id;

    IF v_recent_count >= 9 THEN
      RETURN QUERY SELECT
        p_region_id,
        COALESCE(CASE WHEN v_region.level = 'sigungu' THEN v_region.full_name ELSE v_region.name END, '지역 전체'),
        p_category_id,
        COALESCE(v_category_name, '분야 전체');
      RETURN;
    END IF;

    IF v_region.parent_id IS NOT NULL THEN
      SELECT * INTO v_parent FROM regions WHERE id = v_region.parent_id;
      SELECT COUNT(DISTINCT poster.id) INTO v_recent_count
      FROM posters poster
      JOIN poster_regions poster_region ON poster_region.poster_id = poster.id
      JOIN poster_categories poster_category ON poster_category.poster_id = poster.id
      JOIN regions matched_region ON matched_region.id = poster_region.region_id
      WHERE poster.created_at >= now() - interval '90 days'
        AND poster.poster_status IN ('published', 'closed')
        AND (matched_region.id = v_parent.id OR matched_region.parent_id = v_parent.id)
        AND poster_category.category_id = p_category_id;

      IF v_recent_count >= 9 THEN
        RETURN QUERY SELECT v_parent.id, COALESCE(v_parent.name, '지역 전체'), p_category_id, COALESCE(v_category_name, '분야 전체');
        RETURN;
      END IF;
    END IF;

    RETURN QUERY SELECT NULL::UUID, '전국'::TEXT, p_category_id, COALESCE(v_category_name, '분야 전체');
    RETURN;
  END IF;

  RETURN QUERY SELECT
    p_region_id,
    COALESCE(CASE WHEN v_region.level = 'sigungu' THEN v_region.full_name ELSE v_region.name END, '지역 전체'),
    p_category_id,
    COALESCE(v_category_name, '분야 전체');
END;
$$;

REVOKE ALL ON FUNCTION resolve_closed_poster_alert_default(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_closed_poster_alert_default(UUID, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION save_alert_subscription(
  p_region_id UUID,
  p_category_id UUID,
  p_source_poster_id UUID,
  p_cta_variant TEXT DEFAULT 'closed_poster_v1'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_subscription_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_region_id IS NULL AND p_category_id IS NULL THEN
    RAISE EXCEPTION 'region or category is required' USING ERRCODE = '22023';
  END IF;
  IF p_cta_variant <> 'closed_poster_v1' THEN
    RAISE EXCEPTION 'unsupported CTA variant' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM posters
    WHERE id = p_source_poster_id AND poster_status = 'closed'
  ) THEN
    RAISE EXCEPTION 'source poster must be closed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO alert_subscriptions (
    user_id,
    region_id,
    category_id,
    source_poster_id,
    cta_variant,
    is_active
  ) VALUES (
    v_user_id,
    p_region_id,
    p_category_id,
    p_source_poster_id,
    p_cta_variant,
    true
  )
  ON CONFLICT (user_id, region_id, category_id, institution_id)
  DO UPDATE SET
    source_poster_id = EXCLUDED.source_poster_id,
    cta_variant = EXCLUDED.cta_variant,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_subscription_id;

  UPDATE profiles SET is_notified = true WHERE id = v_user_id;
  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION save_alert_subscription(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_alert_subscription(UUID, UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
