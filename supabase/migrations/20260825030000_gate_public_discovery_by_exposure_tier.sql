-- AI_VERIFICATION_SPEC.md Phase 5
-- Keep rows explicitly classified into exposure tier C out of public discovery,
-- recommendation, semantic search, summary counts, and sitemap feeds.
-- NULL remains visible so older or local unbackfilled rows are not accidentally
-- hidden before the tier job has run.

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
  WHERE poster.poster_status = 'published'
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
  WHERE poster.poster_status = 'published'
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
      AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'))
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

CREATE OR REPLACE FUNCTION public.get_recommended_posters_v2(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    source_org_name TEXT,
    summary_short TEXT,
    poster_status TEXT,
    application_end_at TIMESTAMPTZ,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ,
    recom_score FLOAT,
    similarity_score FLOAT
) AS $$
DECLARE
    v_region_id UUID;
    v_age_band  TEXT;
    v_gender    TEXT;
    v_age_num   INT;
    v_interest_embedding vector(1536);
BEGIN
    SELECT primary_region_id, age_band, gender
    INTO v_region_id, v_age_band, v_gender
    FROM public.profiles WHERE profiles.id = p_user_id;

    v_age_num := CASE v_age_band
        WHEN 'teen'    THEN 16
        WHEN '20s'     THEN 25
        WHEN '30s'     THEN 35
        WHEN '40s'     THEN 45
        WHEN '50s'     THEN 55
        WHEN '60_plus' THEN 65
        ELSE NULL
    END;

    SELECT AVG(e) INTO v_interest_embedding
    FROM (
        SELECT p.embedding AS e
        FROM public.favorites f
        JOIN public.posters p ON p.id = f.poster_id
        WHERE f.user_id = p_user_id AND p.embedding IS NOT NULL
        UNION ALL
        SELECT p.embedding AS e
        FROM public.favorites f
        JOIN public.posters p ON p.id = f.poster_id
        WHERE f.user_id = p_user_id AND p.embedding IS NOT NULL
        UNION ALL
        SELECT p.embedding AS e
        FROM (
            SELECT pvl.poster_id, MAX(pvl.created_at) AS last_viewed_at
            FROM public.poster_view_logs pvl
            WHERE pvl.user_id = p_user_id
            GROUP BY pvl.poster_id
            ORDER BY last_viewed_at DESC
            LIMIT 50
        ) recent_views
        JOIN public.posters p ON p.id = recent_views.poster_id
        WHERE p.embedding IS NOT NULL
    ) signals;

    RETURN QUERY
    WITH user_interests AS (
        SELECT category_id FROM public.user_interest_categories WHERE user_id = p_user_id
    ),
    followed_institutions AS (
        SELECT institution_id FROM public.institution_follows WHERE user_id = p_user_id
    ),
    poster_scores AS (
        SELECT
            p.id,
            p.title,
            p.source_org_name,
            p.summary_short,
            p.poster_status::TEXT,
            p.application_end_at,
            p.thumbnail_url,
            p.created_at,
            (
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM followed_institutions fi
                        WHERE fi.institution_id IN (
                            p.source_institution_id,
                            p.organizer_id,
                            p.application_institution_id
                        )
                    ) THEN 45.0
                    ELSE 0.0
                END
                +
                COALESCE(MAX(
                    CASE
                        WHEN pr.region_id = v_region_id THEN 40.0
                        WHEN r.level = 'nation'         THEN 10.0
                        ELSE 0.0
                    END
                ), 0.0)
                +
                COALESCE(MAX(
                    CASE WHEN pc.category_id IN (SELECT category_id FROM user_interests)
                    THEN 30.0 ELSE 0.0 END
                ), 0.0)
                +
                CASE
                    WHEN NOT EXISTS (SELECT 1 FROM public.poster_audiences pa WHERE pa.poster_id = p.id)
                        THEN 0.0
                    WHEN EXISTS (
                        SELECT 1
                        FROM public.poster_audiences pa
                        JOIN public.audience_groups ag ON ag.id = pa.audience_id
                        WHERE pa.poster_id = p.id
                          AND (ag.min_age IS NULL OR v_age_num IS NULL OR v_age_num >= ag.min_age)
                          AND (ag.max_age IS NULL OR v_age_num IS NULL OR v_age_num <= ag.max_age)
                          AND (
                              ag.gender_restriction IS NULL
                              OR ag.gender_restriction = 'None'
                              OR v_gender IS NULL
                              OR v_gender = 'prefer_not_to_say'
                              OR ag.gender_restriction = v_gender
                          )
                    ) THEN 20.0
                    ELSE -15.0
                END
                +
                CASE
                    WHEN p.application_end_at IS NOT NULL
                         AND p.application_end_at > now()
                         AND p.application_end_at - now() < interval '7 days'
                    THEN 10.0
                    ELSE 0.0
                END
                +
                CASE
                    WHEN v_interest_embedding IS NOT NULL AND p.embedding IS NOT NULL
                    THEN GREATEST(0.0, (1.0 - (p.embedding <=> v_interest_embedding))) * 30.0
                    ELSE 0.0
                END
            )::FLOAT AS recom_score,
            CASE
                WHEN v_interest_embedding IS NOT NULL AND p.embedding IS NOT NULL
                THEN GREATEST(0.0, (1.0 - (p.embedding <=> v_interest_embedding)))
                ELSE NULL
            END::FLOAT AS similarity_score
        FROM public.posters p
        LEFT JOIN public.poster_regions   pr ON p.id = pr.poster_id
        LEFT JOIN public.regions           r ON pr.region_id = r.id
        LEFT JOIN public.poster_categories pc ON p.id = pc.poster_id
        WHERE p.poster_status = 'published'
          AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'))
          AND (p.application_end_at IS NULL OR p.application_end_at > now())
        GROUP BY p.id, p.title, p.source_org_name, p.summary_short,
                 p.poster_status, p.application_end_at, p.thumbnail_url, p.created_at, p.embedding
    )
    SELECT ps.id::UUID, ps.title::TEXT, ps.source_org_name::TEXT, ps.summary_short::TEXT,
           ps.poster_status::TEXT, ps.application_end_at::TIMESTAMPTZ, ps.thumbnail_url::TEXT,
           ps.created_at::TIMESTAMPTZ, ps.recom_score::FLOAT, ps.similarity_score::FLOAT
    FROM poster_scores ps
    ORDER BY ps.recom_score DESC, ps.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_recommended_posters_v2(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recommended_posters_v2(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
