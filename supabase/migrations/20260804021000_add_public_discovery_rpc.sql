-- 지역·분야 랜딩의 관계 ID를 긴 URL 파라미터로 보내지 않고 DB에서 직접 필터링한다.
-- SECURITY INVOKER로 공개 RLS를 그대로 적용한다.

CREATE OR REPLACE FUNCTION public.search_public_posters(
  p_query TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_region_ids UUID[] DEFAULT NULL,
  p_include_closed BOOLEAN DEFAULT false,
  p_sort TEXT DEFAULT 'latest',
  p_limit INTEGER DEFAULT 60
)
RETURNS SETOF public.posters
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT poster.*
  FROM public.posters AS poster
  WHERE poster.poster_status = 'published'
    AND (
      p_include_closed
      OR poster.application_end_at IS NULL
      OR poster.application_end_at >= now()
    )
    AND (
      NULLIF(BTRIM(p_query), '') IS NULL
      OR poster.title ILIKE '%' || BTRIM(p_query) || '%'
      OR poster.source_org_name ILIKE '%' || BTRIM(p_query) || '%'
      OR poster.summary_short ILIKE '%' || BTRIM(p_query) || '%'
    )
    AND (
      p_category_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.poster_categories AS category_link
        WHERE category_link.poster_id = poster.id
          AND category_link.category_id = p_category_id
      )
    )
    AND (
      p_region_ids IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.poster_regions AS region_link
        WHERE region_link.poster_id = poster.id
          AND region_link.region_id = ANY(p_region_ids)
      )
    )
  ORDER BY
    CASE WHEN p_sort = 'deadline' THEN poster.application_end_at END ASC NULLS LAST,
    CASE WHEN p_sort <> 'deadline' THEN poster.created_at END DESC NULLS LAST,
    poster.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_public_posters(TEXT, UUID, UUID[], BOOLEAN, TEXT, INTEGER)
  TO anon, authenticated;
