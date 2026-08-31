-- Allow the public discovery "include closed" option to search archived closed posters.
-- Default discovery remains active published posters only.

CREATE OR REPLACE FUNCTION public.search_public_posters(
  p_query TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_region_ids UUID[] DEFAULT NULL,
  p_include_closed BOOLEAN DEFAULT false,
  p_sort TEXT DEFAULT 'latest',
  p_limit INTEGER DEFAULT 240
)
RETURNS SETOF public.posters
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT poster.*
  FROM public.posters AS poster
  WHERE (
      poster.poster_status = 'published'
      OR (p_include_closed AND poster.poster_status = 'closed')
    )
    AND (poster.exposure_tier IS NULL OR poster.exposure_tier IN ('A', 'B'))
    AND (
      p_include_closed
      OR (
        (poster.application_start_at IS NULL OR poster.application_start_at <= now())
        AND (
          poster.application_end_at >= now()
          OR (poster.application_end_at IS NULL AND poster.deadline_type IN ('ongoing', 'until_exhausted'))
        )
      )
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
      OR cardinality(p_region_ids) = 0
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
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 240), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.search_public_posters(TEXT, UUID, UUID[], BOOLEAN, TEXT, INTEGER)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.count_public_posters(
  p_query TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_region_ids UUID[] DEFAULT NULL,
  p_include_closed BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.posters AS poster
  WHERE (
      poster.poster_status = 'published'
      OR (p_include_closed AND poster.poster_status = 'closed')
    )
    AND (poster.exposure_tier IS NULL OR poster.exposure_tier IN ('A', 'B'))
    AND (
      p_include_closed
      OR (
        (poster.application_start_at IS NULL OR poster.application_start_at <= now())
        AND (
          poster.application_end_at >= now()
          OR (poster.application_end_at IS NULL AND poster.deadline_type IN ('ongoing', 'until_exhausted'))
        )
      )
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
      OR cardinality(p_region_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM public.poster_regions AS region_link
        WHERE region_link.poster_id = poster.id
          AND region_link.region_id = ANY(p_region_ids)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_public_posters(TEXT, UUID, UUID[], BOOLEAN)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
