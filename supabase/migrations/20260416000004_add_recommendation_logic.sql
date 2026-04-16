-- Create a function to fetch recommended posters based on user profile
CREATE OR REPLACE FUNCTION get_recommended_posters(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    source_org_name TEXT,
    category_id UUID,
    category_name TEXT,
    primary_region_id UUID,
    region_name TEXT,
    application_end_at TIMESTAMPTZ,
    recommend_score INT
) AS $$
DECLARE
    u_region_id UUID;
    u_age_band VARCHAR(50);
BEGIN
    -- 1. 사용자 프로필 정보 가져오기
    SELECT primary_region_id, age_band INTO u_region_id, u_age_band
    FROM profiles
    WHERE id = p_user_id;

    RETURN QUERY
    WITH poster_scores AS (
        SELECT 
            p.id as p_id,
            p.title as p_title,
            p.source_org_name as p_org,
            p.category_id as p_cat_id,
            c.name as p_cat_name,
            p.primary_region_id as p_reg_id,
            r.name as p_reg_name,
            p.application_end_at as p_end_at,
            (
                -- 지역 가중치 (50점)
                CASE 
                    WHEN p.primary_region_id = u_region_id THEN 50
                    WHEN p.primary_region_id IS NULL THEN 20 -- 전국 공고 보너스
                    ELSE 0
                END +
                -- 카테고리 관심사 가중치 (40점) - user_interest_categories 테이블이 있다고 가정
                CASE 
                    WHEN EXISTS (SELECT 1 FROM user_interest_categories uic WHERE uic.user_id = p_user_id AND uic.category_id = p.category_id) THEN 40
                    ELSE 0
                END +
                -- 마감 임박 가중치 (최대 20점)
                CASE 
                    WHEN p.application_end_at - now() < interval '3 days' AND p.application_end_at > now() THEN 20
                    WHEN p.application_end_at - now() < interval '7 days' AND p.application_end_at > now() THEN 10
                    ELSE 0
                END
            ) as score
        FROM posters p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN regions r ON p.primary_region_id = r.id
        WHERE p.poster_status = 'published'
          AND (p.application_end_at IS NULL OR p.application_end_at > now())
    )
    SELECT 
        p_id, p_title, p_org, p_cat_id, p_cat_name, p_reg_id, p_reg_name, p_end_at, score
    FROM poster_scores
    ORDER BY score DESC, p_end_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
