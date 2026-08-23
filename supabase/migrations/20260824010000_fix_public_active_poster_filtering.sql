-- Align public "accepting applications" filtering with the app policy.
-- Missing application dates are not treated as active unless deadline_type is
-- explicitly ongoing or until_exhausted.

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

DROP FUNCTION IF EXISTS public.match_posters_by_embedding(public.vector, INT, FLOAT, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.match_posters_by_embedding(
    p_query_embedding vector(1536),
    p_limit INT DEFAULT 60,
    p_match_threshold FLOAT DEFAULT 0.2,
    p_category_id UUID DEFAULT NULL,
    p_region_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    source_org_name TEXT,
    summary_short TEXT,
    poster_status TEXT,
    application_start_at TIMESTAMPTZ,
    application_end_at TIMESTAMPTZ,
    deadline_type TEXT,
    thumbnail_url TEXT,
    source_key TEXT,
    created_at TIMESTAMPTZ,
    semantic_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id::UUID,
        p.title::TEXT,
        p.source_org_name::TEXT,
        p.summary_short::TEXT,
        p.poster_status::TEXT,
        p.application_start_at::TIMESTAMPTZ,
        p.application_end_at::TIMESTAMPTZ,
        p.deadline_type::TEXT,
        p.thumbnail_url::TEXT,
        p.source_key::TEXT,
        p.created_at::TIMESTAMPTZ,
        GREATEST(0.0, 1.0 - (p.embedding <=> p_query_embedding))::FLOAT AS semantic_score
    FROM public.posters p
    WHERE p.poster_status = 'published'
      AND p.embedding IS NOT NULL
      AND (p.application_start_at IS NULL OR p.application_start_at <= now())
      AND (
        p.application_end_at >= now()
        OR (p.application_end_at IS NULL AND p.deadline_type IN ('ongoing', 'until_exhausted'))
      )
      AND GREATEST(0.0, 1.0 - (p.embedding <=> p_query_embedding)) >= p_match_threshold
      AND (
        p_category_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM public.poster_categories pc
            WHERE pc.poster_id = p.id
              AND pc.category_id = p_category_id
        )
      )
      AND (
        p_region_ids IS NULL
        OR cardinality(p_region_ids) = 0
        OR EXISTS (
            SELECT 1
            FROM public.poster_regions pr
            WHERE pr.poster_id = p.id
              AND pr.region_id = ANY(p_region_ids)
        )
      )
    ORDER BY p.embedding <=> p_query_embedding ASC, p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.match_posters_by_embedding(public.vector, INT, FLOAT, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_posters_by_embedding(public.vector, INT, FLOAT, UUID, UUID[]) TO service_role;
