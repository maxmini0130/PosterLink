-- Core natural-language search v1.
-- Accepts a query embedding generated server-side and returns active published posters
-- ordered by cosine similarity. Keyword/synonym search remains the fallback path.

CREATE OR REPLACE FUNCTION match_posters_by_embedding(
    p_query_embedding vector(1536),
    p_limit INT DEFAULT 60,
    p_match_threshold FLOAT DEFAULT 0.2
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
        p.id,
        p.title,
        p.source_org_name,
        p.summary_short,
        p.poster_status::TEXT,
        p.application_end_at,
        p.thumbnail_url,
        p.source_key,
        p.created_at,
        GREATEST(0.0, 1.0 - (p.embedding <=> p_query_embedding))::FLOAT AS semantic_score
    FROM posters p
    WHERE p.poster_status = 'published'
      AND p.embedding IS NOT NULL
      AND (p.application_end_at IS NULL OR p.application_end_at > now())
      AND GREATEST(0.0, 1.0 - (p.embedding <=> p_query_embedding)) >= p_match_threshold
    ORDER BY p.embedding <=> p_query_embedding ASC, p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION match_posters_by_embedding(vector, INT, FLOAT) TO anon, authenticated, service_role;
