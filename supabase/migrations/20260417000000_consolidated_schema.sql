-- ============================================================
-- PosterLink Consolidated Schema
-- Merges all previous migrations into a single, correctly
-- ordered migration. Source of truth: docs/05_data_model.md
-- ============================================================

-- 0. Helper: auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 1. MASTER DATA (기준정보)
-- ============================================================

CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES regions(id),
    level TEXT NOT NULL CHECK (level IN ('nation','sido','sigungu','eupmyeondong')),
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    full_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audience_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    min_age INT,
    max_age INT,
    gender_restriction TEXT DEFAULT 'None',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE synonym_dictionary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL,
    synonym TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_synonym_word ON synonym_dictionary(word);
CREATE INDEX idx_synonym_synonym ON synonym_dictionary(synonym);


-- ============================================================
-- 2. USER PROFILES (Supabase Auth 연동)
-- ============================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user','operator','admin','super_admin')),
    gender TEXT CHECK (gender IN ('male','female','other','unknown','prefer_not_to_say')),
    age_band TEXT CHECK (age_band IN ('teen','20s','30s','40s','50s','60_plus','unknown')),
    primary_region_id UUID REFERENCES regions(id),
    is_notified BOOLEAN DEFAULT true,
    expo_push_token TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_interest_categories (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, category_id)
);


-- ============================================================
-- 3. POSTERS (포스터)
-- ============================================================

CREATE TABLE posters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source_org_name TEXT,
    summary_short TEXT,
    summary_long TEXT,
    poster_status TEXT DEFAULT 'draft'
        CHECK (poster_status IN ('draft','review','published','hidden','rejected','closed','archived')),
    application_start_at TIMESTAMPTZ,
    application_end_at TIMESTAMPTZ,
    exposure_start_at TIMESTAMPTZ DEFAULT now(),
    exposure_end_at TIMESTAMPTZ,
    is_featured BOOLEAN DEFAULT false,
    favorite_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    created_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    thumbnail_url TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_posters_status ON posters(poster_status);
CREATE INDEX idx_posters_end_at ON posters(application_end_at);
CREATE INDEX idx_posters_created_by ON posters(created_by);

CREATE TABLE poster_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    image_type TEXT DEFAULT 'original'
        CHECK (image_type IN ('original','processed','thumbnail')),
    width INT,
    height INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE poster_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    link_type TEXT DEFAULT 'official_notice'
        CHECK (link_type IN (
            'official_notice','official_apply','official_homepage',
            'reference_blog','reference_news','reference_video','other'
        )),
    title TEXT,
    url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 4. M:N JUNCTION TABLES (교차 테이블)
-- ============================================================

CREATE TABLE poster_categories (
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (poster_id, category_id)
);

CREATE TABLE poster_regions (
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    region_id UUID REFERENCES regions(id) ON DELETE CASCADE,
    PRIMARY KEY (poster_id, region_id)
);

CREATE TABLE poster_audiences (
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    audience_id UUID REFERENCES audience_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (poster_id, audience_id)
);


-- ============================================================
-- 5. USER INTERACTIONS (사용자 활동)
-- ============================================================

CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, poster_id)
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id),
    comment_type TEXT DEFAULT 'general'
        CHECK (comment_type IN ('question','review','info','correction','general')),
    body TEXT NOT NULL,
    status TEXT DEFAULT 'normal'
        CHECK (status IN ('normal','hidden','deleted','blocked')),
    is_official BOOLEAN DEFAULT false,
    like_count INT DEFAULT 0,
    report_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_comments_poster ON comments(poster_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_status ON comments(status);

CREATE TABLE comment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    reporter_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL
        CHECK (reason_code IN ('abuse','misinformation','spam','political','privacy','hate','other')),
    reason_detail TEXT,
    report_status TEXT DEFAULT 'received'
        CHECK (report_status IN ('received','reviewing','actioned','dismissed')),
    handled_by UUID REFERENCES profiles(id),
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reports_status ON comment_reports(report_status);
CREATE INDEX idx_reports_comment ON comment_reports(comment_id);


-- ============================================================
-- 6. ADMIN & OPERATIONS (관리/운영 이력)
-- ============================================================

CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES profiles(id),
    target_type TEXT NOT NULL
        CHECK (target_type IN ('poster','comment','user','report','category')),
    target_id UUID,
    action_type TEXT NOT NULL
        CHECK (action_type IN ('create','update','hide','delete','suspend','approve','reject','expire')),
    action_reason TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 7. NOTIFICATIONS (알림)
-- ============================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL
        CHECK (type IN ('favorite_deadline','new_match','comment_reply','comment_mention','system_notice')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_type TEXT CHECK (target_type IN ('poster','comment','system')),
    target_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);


-- ============================================================
-- 8. SEARCH LOGS (검색 로그)
-- ============================================================

CREATE TABLE search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    query TEXT NOT NULL,
    result_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonym_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interest_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE posters ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

-- 9-1. Master data: anyone can read
CREATE POLICY "regions_select" ON regions FOR SELECT USING (true);
CREATE POLICY "categories_select" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "audience_groups_select" ON audience_groups FOR SELECT USING (is_active = true);
CREATE POLICY "synonyms_select" ON synonym_dictionary FOR SELECT USING (true);

-- 9-2. Profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 9-3. User interests
CREATE POLICY "interests_all" ON user_interest_categories FOR ALL USING (auth.uid() = user_id);

-- 9-4. Posters: public sees published; operators see own; admins see all
CREATE POLICY "posters_select" ON posters FOR SELECT USING (
    poster_status = 'published'
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "posters_insert" ON posters FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "posters_update" ON posters FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "posters_delete" ON posters FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 9-5. Poster child tables: read for all, write for authenticated
CREATE POLICY "poster_images_select" ON poster_images FOR SELECT USING (true);
CREATE POLICY "poster_images_insert" ON poster_images FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "poster_links_select" ON poster_links FOR SELECT USING (true);
CREATE POLICY "poster_links_insert" ON poster_links FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "poster_categories_select" ON poster_categories FOR SELECT USING (true);
CREATE POLICY "poster_categories_insert" ON poster_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "poster_regions_select" ON poster_regions FOR SELECT USING (true);
CREATE POLICY "poster_regions_insert" ON poster_regions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "poster_audiences_select" ON poster_audiences FOR SELECT USING (true);
CREATE POLICY "poster_audiences_insert" ON poster_audiences FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 9-6. Favorites: users manage own
CREATE POLICY "favorites_all" ON favorites FOR ALL USING (auth.uid() = user_id);

-- 9-7. Comments
CREATE POLICY "comments_select" ON comments FOR SELECT USING (
    status = 'normal'
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_update" ON comments FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 9-8. Comment reports
CREATE POLICY "reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);
CREATE POLICY "reports_select" ON comment_reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
CREATE POLICY "reports_update" ON comment_reports FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 9-9. Admin actions
CREATE POLICY "admin_actions_all" ON admin_actions FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 9-10. Notifications
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- 9-11. Search logs: no direct access (written via security-definer function)
CREATE POLICY "search_logs_deny" ON search_logs FOR SELECT USING (false);


-- ============================================================
-- 10. TRIGGERS (updated_at 자동 갱신)
-- ============================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_updated_at_%I BEFORE UPDATE ON %I '
            'FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()',
            t, t
        );
    END LOOP;
END;
$$;


-- ============================================================
-- 11. RPC FUNCTIONS
-- ============================================================

-- 11-1. 검색 로그 기록
CREATE OR REPLACE FUNCTION log_search(
    p_user_id UUID,
    p_query TEXT,
    p_result_count INT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO search_logs (user_id, query, result_count)
    VALUES (p_user_id, p_query, p_result_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11-2. 동의어 확장 검색
CREATE OR REPLACE FUNCTION search_posters_with_synonyms(
    p_query TEXT,
    p_category_id UUID DEFAULT NULL,
    p_region_id UUID DEFAULT NULL
)
RETURNS SETOF posters AS $$
DECLARE
    v_search_terms TEXT[];
BEGIN
    -- 빈 검색어면 전체 반환
    IF p_query IS NULL OR trim(p_query) = '' THEN
        RETURN QUERY
        SELECT DISTINCT p.*
        FROM posters p
        LEFT JOIN poster_categories pc ON p.id = pc.poster_id
        LEFT JOIN poster_regions pr ON p.id = pr.poster_id
        WHERE p.poster_status = 'published'
          AND (p_category_id IS NULL OR pc.category_id = p_category_id)
          AND (p_region_id IS NULL OR pr.region_id = p_region_id)
        ORDER BY p.created_at DESC;
        RETURN;
    END IF;

    -- 동의어 확장
    SELECT ARRAY_AGG(DISTINCT term) INTO v_search_terms
    FROM (
        SELECT trim(p_query) AS term
        UNION
        SELECT synonym FROM synonym_dictionary WHERE word = trim(p_query)
        UNION
        SELECT word FROM synonym_dictionary WHERE synonym = trim(p_query)
    ) terms;

    RETURN QUERY
    SELECT DISTINCT p.*
    FROM posters p
    LEFT JOIN poster_categories pc ON p.id = pc.poster_id
    LEFT JOIN poster_regions pr ON p.id = pr.poster_id
    WHERE
        p.poster_status = 'published'
        AND (
            p.title ILIKE ANY (SELECT '%' || t || '%' FROM unnest(v_search_terms) t)
            OR p.source_org_name ILIKE ANY (SELECT '%' || t || '%' FROM unnest(v_search_terms) t)
            OR p.summary_short ILIKE ANY (SELECT '%' || t || '%' FROM unnest(v_search_terms) t)
        )
        AND (p_category_id IS NULL OR pc.category_id = p_category_id)
        AND (p_region_id IS NULL OR pr.region_id = p_region_id)
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11-3. 개인화 추천 피드
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
    )
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

-- 11-4. 지역별 인기 통계
CREATE OR REPLACE FUNCTION get_popular_regions()
RETURNS TABLE (
    name TEXT,
    count INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.name,
        COUNT(pr.poster_id)::INT AS count
    FROM regions r
    JOIN poster_regions pr ON r.id = pr.region_id
    WHERE r.level = 'sido'
    GROUP BY r.id, r.name
    ORDER BY count DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11-5. 인기 검색어
CREATE OR REPLACE FUNCTION get_popular_keywords(p_limit INT DEFAULT 5)
RETURNS TABLE (keyword TEXT, search_count BIGINT)
AS $$
BEGIN
  RETURN QUERY
  SELECT query AS keyword, COUNT(*) AS search_count
  FROM search_logs
  WHERE created_at > now() - interval '30 days'
    AND query IS NOT NULL
    AND trim(query) != ''
  GROUP BY query
  ORDER BY search_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
