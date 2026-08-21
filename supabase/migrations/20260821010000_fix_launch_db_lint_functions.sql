-- Launch readiness: fix remote database lint errors in legacy helper RPCs.
-- These functions are kept for compatibility, but must be valid under pgTAP/db lint.

CREATE OR REPLACE FUNCTION get_popular_regions()
RETURNS TABLE (name TEXT, count INT) AS $$
BEGIN
    RETURN QUERY
    SELECT r.name::TEXT, COUNT(pr.poster_id)::INT AS count
    FROM regions r
    JOIN poster_regions pr ON r.id = pr.region_id
    WHERE r.level = 'sido'
    GROUP BY r.id, r.name
    ORDER BY count DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
                ) THEN 45.0
                ELSE 0.0
            END
            +
            COALESCE(MAX(
                CASE
                    WHEN pr.region_id = (SELECT primary_region_id FROM profiles WHERE profiles.id = p_user_id) THEN 50.0
                    WHEN r.level = 'nation' THEN 10.0
                    ELSE 0.0
                END
            ), 0.0)
            +
            COALESCE(MAX(
                CASE
                    WHEN pc.category_id IN (SELECT category_id FROM user_interests) THEN 30.0
                    ELSE 0.0
                END
            ), 0.0)
            +
            CASE
                WHEN p.application_end_at IS NOT NULL
                     AND p.application_end_at > now()
                     AND p.application_end_at - now() < interval '7 days' THEN 20.0
                ELSE 0.0
            END
        ) AS recom_score
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

CREATE OR REPLACE FUNCTION get_blocked_user_ids()
RETURNS TABLE (user_id UUID) AS $$
BEGIN
    IF to_regclass('public.blocks') IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY EXECUTE $query$
        SELECT
            CASE
                WHEN b.blocker_id = auth.uid() THEN b.blocked_id
                ELSE b.blocker_id
            END AS user_id
        FROM public.blocks b
        WHERE b.blocker_id = auth.uid() OR b.blocked_id = auth.uid()
    $query$;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
