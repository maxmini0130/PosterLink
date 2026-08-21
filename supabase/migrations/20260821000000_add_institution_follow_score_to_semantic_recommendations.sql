-- Connect institution follows to the semantic recommendation RPC used by the web home feed.
-- The older get_recommended_posters RPC already gives followed institutions 45 points.
-- This keeps the v2 recommendation path consistent while preserving the existing
-- region/category/audience/deadline/embedding signals and return shape.

CREATE OR REPLACE FUNCTION get_recommended_posters_v2(
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
    FROM profiles WHERE profiles.id = p_user_id;

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
        FROM favorites f
        JOIN posters p ON p.id = f.poster_id
        WHERE f.user_id = p_user_id AND p.embedding IS NOT NULL
        UNION ALL
        SELECT p.embedding AS e
        FROM favorites f
        JOIN posters p ON p.id = f.poster_id
        WHERE f.user_id = p_user_id AND p.embedding IS NOT NULL
        UNION ALL
        SELECT p.embedding AS e
        FROM (
            SELECT pvl.poster_id, MAX(pvl.created_at) AS last_viewed_at
            FROM poster_view_logs pvl
            WHERE pvl.user_id = p_user_id
            GROUP BY pvl.poster_id
            ORDER BY last_viewed_at DESC
            LIMIT 50
        ) recent_views
        JOIN posters p ON p.id = recent_views.poster_id
        WHERE p.embedding IS NOT NULL
    ) signals;

    RETURN QUERY
    WITH user_interests AS (
        SELECT category_id FROM user_interest_categories WHERE user_id = p_user_id
    ),
    followed_institutions AS (
        SELECT institution_id FROM institution_follows WHERE user_id = p_user_id
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
                    WHEN NOT EXISTS (SELECT 1 FROM poster_audiences pa WHERE pa.poster_id = p.id)
                        THEN 0.0
                    WHEN EXISTS (
                        SELECT 1
                        FROM poster_audiences pa
                        JOIN audience_groups ag ON ag.id = pa.audience_id
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
        FROM posters p
        LEFT JOIN poster_regions   pr ON p.id = pr.poster_id
        LEFT JOIN regions           r ON pr.region_id = r.id
        LEFT JOIN poster_categories pc ON p.id = pc.poster_id
        WHERE p.poster_status = 'published'
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
