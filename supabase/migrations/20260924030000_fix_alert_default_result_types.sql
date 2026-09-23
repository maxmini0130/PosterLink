-- Keep the public resolver's declared TEXT columns stable when taxonomy names
-- are stored as VARCHAR columns.

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
        COALESCE(CASE WHEN v_region.level = 'sigungu' THEN v_region.full_name ELSE v_region.name END, '지역 전체')::TEXT,
        p_category_id,
        COALESCE(v_category_name, '분야 전체')::TEXT;
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
        RETURN QUERY SELECT v_parent.id, COALESCE(v_parent.name, '지역 전체')::TEXT, p_category_id, COALESCE(v_category_name, '분야 전체')::TEXT;
        RETURN;
      END IF;
    END IF;

    RETURN QUERY SELECT NULL::UUID, '전국'::TEXT, p_category_id, COALESCE(v_category_name, '분야 전체')::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    p_region_id,
    COALESCE(CASE WHEN v_region.level = 'sigungu' THEN v_region.full_name ELSE v_region.name END, '지역 전체')::TEXT,
    p_category_id,
    COALESCE(v_category_name, '분야 전체')::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION resolve_closed_poster_alert_default(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_closed_poster_alert_default(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
