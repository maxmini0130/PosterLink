-- ============================================================
-- 맞춤 설정 개선
-- 1. onboarding_completed 컬럼 추가
-- 2. get_recommended_posters 함수 개선 (성별 + 대상그룹 반영)
-- ============================================================

-- 1. onboarding_completed 컬럼
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 기존 프로필 중 지역/연령 설정된 사용자는 완료로 처리
UPDATE profiles SET onboarding_completed = true
WHERE primary_region_id IS NOT NULL AND age_band IS NOT NULL;

-- 2. get_recommended_posters 함수 개선
--    성별(gender) + 대상그룹(audience_groups) 매칭 반영
--    scoring: 지역(40) + 카테고리(30) + 대상그룹(20) + 마감임박(10) = 100
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
DECLARE
    v_region_id UUID;
    v_age_band  TEXT;
    v_gender    TEXT;
    v_age_num   INT;
BEGIN
    -- 사용자 프로필 조회 (한 번만)
    SELECT primary_region_id, age_band, gender
    INTO v_region_id, v_age_band, v_gender
    FROM profiles WHERE profiles.id = p_user_id;

    -- age_band → 대략적인 나이로 변환 (audience_groups 매칭용)
    v_age_num := CASE v_age_band
        WHEN 'teen'    THEN 16
        WHEN '20s'     THEN 25
        WHEN '30s'     THEN 35
        WHEN '40s'     THEN 45
        WHEN '50s'     THEN 55
        WHEN '60_plus' THEN 65
        ELSE NULL
    END;

    RETURN QUERY
    WITH user_interests AS (
        SELECT category_id FROM user_interest_categories WHERE user_id = p_user_id
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
                -- 지역 매칭 (최대 40점)
                COALESCE(MAX(
                    CASE
                        WHEN pr.region_id = v_region_id THEN 40.0
                        WHEN r.level = 'nation'         THEN 10.0
                        ELSE 0.0
                    END
                ), 0.0)
                +
                -- 카테고리 매칭 (최대 30점)
                COALESCE(MAX(
                    CASE WHEN pc.category_id IN (SELECT category_id FROM user_interests)
                    THEN 30.0 ELSE 0.0 END
                ), 0.0)
                +
                -- 대상그룹 / 성별 매칭 (최대 +20, 불일치 -15)
                CASE
                    -- 대상 제한 없는 포스터: 중립
                    WHEN NOT EXISTS (SELECT 1 FROM poster_audiences pa WHERE pa.poster_id = p.id)
                        THEN 0.0
                    -- 대상 제한 있고 사용자가 매칭됨: 보너스
                    WHEN EXISTS (
                        SELECT 1
                        FROM poster_audiences pa
                        JOIN audience_groups ag ON ag.id = pa.audience_group_id
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
                    -- 대상 제한 있고 불일치: 페널티
                    ELSE -15.0
                END
                +
                -- 마감 임박 보너스 (7일 이내, 최대 10점)
                CASE
                    WHEN p.application_end_at IS NOT NULL
                         AND p.application_end_at > now()
                         AND p.application_end_at - now() < interval '7 days'
                    THEN 10.0
                    ELSE 0.0
                END
            )::FLOAT AS recom_score
        FROM posters p
        LEFT JOIN poster_regions    pr ON p.id = pr.poster_id
        LEFT JOIN regions            r  ON pr.region_id = r.id
        LEFT JOIN poster_categories pc  ON p.id = pc.poster_id
        WHERE p.poster_status = 'published'
          AND (p.application_end_at IS NULL OR p.application_end_at > now())
        GROUP BY p.id, p.title, p.source_org_name, p.summary_short,
                 p.poster_status, p.application_end_at, p.thumbnail_url, p.created_at
    )
    SELECT ps.id, ps.title, ps.source_org_name, ps.summary_short,
           ps.poster_status, ps.application_end_at, ps.thumbnail_url,
           ps.created_at, ps.recom_score
    FROM poster_scores ps
    ORDER BY ps.recom_score DESC, ps.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
