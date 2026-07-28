-- Keep semantic search result ranking in the database when category/region filters are active.
-- Fetching the top matches globally and filtering client-side can hide good filtered matches.

DROP FUNCTION IF EXISTS match_posters_by_embedding(vector, INT, FLOAT);

CREATE OR REPLACE FUNCTION match_posters_by_embedding(
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
    application_end_at TIMESTAMPTZ,
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
        p.application_end_at::TIMESTAMPTZ,
        p.thumbnail_url::TEXT,
        p.source_key::TEXT,
        p.created_at::TIMESTAMPTZ,
        GREATEST(0.0, 1.0 - (p.embedding <=> p_query_embedding))::FLOAT AS semantic_score
    FROM posters p
    WHERE p.poster_status = 'published'
      AND p.embedding IS NOT NULL
      AND (p.application_end_at IS NULL OR p.application_end_at > now())
      AND GREATEST(0.0, 1.0 - (p.embedding <=> p_query_embedding)) >= p_match_threshold
      AND (
        p_category_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM poster_categories pc
            WHERE pc.poster_id = p.id
              AND pc.category_id = p_category_id
        )
      )
      AND (
        p_region_ids IS NULL
        OR cardinality(p_region_ids) = 0
        OR EXISTS (
            SELECT 1
            FROM poster_regions pr
            WHERE pr.poster_id = p.id
              AND pr.region_id = ANY(p_region_ids)
        )
      )
    ORDER BY p.embedding <=> p_query_embedding ASC, p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION match_posters_by_embedding(vector, INT, FLOAT, UUID, UUID[]) TO anon, authenticated, service_role;
