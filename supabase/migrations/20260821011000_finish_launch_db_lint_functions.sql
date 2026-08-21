-- Launch readiness: finish remaining db lint issues from legacy helper RPCs.

DROP FUNCTION IF EXISTS get_recommended_posters(uuid, integer);
CREATE OR REPLACE FUNCTION get_recommended_posters(
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
    recom_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH user_interests AS (
        SELECT category_id FROM user_interest_categories WHERE user_id = p_user_id
    ),
    followed_institutions AS (
        SELECT institution_id FROM institution_follows WHERE user_id = p_user_id
    )
    SELECT
        p.id,
        p.title::TEXT,
        p.source_org_name::TEXT,
        p.summary_short::TEXT,
        p.poster_status::TEXT,
        p.application_end_at,
        p.thumbnail_url::TEXT,
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
                ) THEN 45.0::double precision
                ELSE 0.0::double precision
            END
            +
            COALESCE(MAX(
                CASE
                    WHEN pr.region_id = (SELECT primary_region_id FROM profiles WHERE profiles.id = p_user_id) THEN 50.0::double precision
                    WHEN r.level = 'nation' THEN 10.0::double precision
                    ELSE 0.0::double precision
                END
            ), 0.0::double precision)
            +
            COALESCE(MAX(
                CASE
                    WHEN pc.category_id IN (SELECT category_id FROM user_interests) THEN 30.0::double precision
                    ELSE 0.0::double precision
                END
            ), 0.0::double precision)
            +
            CASE
                WHEN p.application_end_at IS NOT NULL
                     AND p.application_end_at > now()
                     AND p.application_end_at - now() < interval '7 days' THEN 20.0::double precision
                ELSE 0.0::double precision
            END
        )::double precision AS recom_score
    FROM posters p
    LEFT JOIN poster_regions pr ON p.id = pr.poster_id
    LEFT JOIN regions r ON pr.region_id = r.id
    LEFT JOIN poster_categories pc ON p.id = pc.poster_id
    WHERE p.poster_status = 'published'
      AND (p.application_end_at IS NULL OR p.application_end_at > now())
    GROUP BY p.id, p.title, p.source_org_name, p.summary_short,
             p.poster_status, p.application_end_at, p.thumbnail_url, p.created_at
    ORDER BY recom_score DESC, p.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_blocked_user_ids();

NOTIFY pgrst, 'reload schema';
