-- ============================================================
-- PosterLink Delta Migration
-- 기존 DB(구 스키마)와 consolidated_schema 간의 차이를 메운다.
-- 이미 존재하는 테이블/컬럼은 건드리지 않는다.
-- ============================================================


-- ============================================================
-- 1. 기존 테이블 컬럼 수정
-- ============================================================

-- 1-1. posters: status → poster_status rename
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posters' AND column_name = 'status'
    ) THEN
        ALTER TABLE posters RENAME COLUMN status TO poster_status;
    END IF;
END $$;

-- 1-2. posters: thumbnail_url 컬럼 추가 (코드에서 직접 URL 저장용)
ALTER TABLE posters ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- 1-3. profiles: 누락 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_notified BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- 1-3. comments: parent_id 추가
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id);


-- ============================================================
-- 2. 누락 테이블 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS audience_groups (
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

CREATE TABLE IF NOT EXISTS synonym_dictionary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL,
    synonym TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_synonym_word ON synonym_dictionary(word);
CREATE INDEX IF NOT EXISTS idx_synonym_synonym ON synonym_dictionary(synonym);

CREATE TABLE IF NOT EXISTS poster_categories (
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (poster_id, category_id)
);

CREATE TABLE IF NOT EXISTS poster_regions (
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    region_id UUID REFERENCES regions(id) ON DELETE CASCADE,
    PRIMARY KEY (poster_id, region_id)
);

CREATE TABLE IF NOT EXISTS poster_audiences (
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    audience_id UUID REFERENCES audience_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (poster_id, audience_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, poster_id)
);

CREATE TABLE IF NOT EXISTS comment_reports (
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
CREATE INDEX IF NOT EXISTS idx_reports_status ON comment_reports(report_status);
CREATE INDEX IF NOT EXISTS idx_reports_comment ON comment_reports(comment_id);

CREATE TABLE IF NOT EXISTS admin_actions (
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

CREATE TABLE IF NOT EXISTS notifications (
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
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    query TEXT NOT NULL,
    result_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 3. posters 인덱스 (rename 후 재생성)
-- ============================================================

DROP INDEX IF EXISTS idx_posters_status;
CREATE INDEX IF NOT EXISTS idx_posters_status ON posters(poster_status);
CREATE INDEX IF NOT EXISTS idx_posters_end_at ON posters(application_end_at);
CREATE INDEX IF NOT EXISTS idx_posters_created_by ON posters(created_by);
CREATE INDEX IF NOT EXISTS idx_comments_poster ON comments(poster_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);


-- ============================================================
-- 4. RLS 활성화 (새 테이블)
-- ============================================================

ALTER TABLE audience_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonym_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. RLS 정책
-- ============================================================

-- 5-1. posters: poster_status로 rename됐으므로 기존 정책 교체
DROP POLICY IF EXISTS "posters_select" ON posters;
DROP POLICY IF EXISTS "posters_insert" ON posters;
DROP POLICY IF EXISTS "posters_update" ON posters;

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
DROP POLICY IF EXISTS "posters_delete" ON posters;
CREATE POLICY "posters_delete" ON posters FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

-- 5-2. 새 테이블 정책 (멱등성: 이미 존재하면 DROP 후 재생성)
DROP POLICY IF EXISTS "audience_groups_select" ON audience_groups;
CREATE POLICY "audience_groups_select" ON audience_groups FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "synonyms_select" ON synonym_dictionary;
CREATE POLICY "synonyms_select" ON synonym_dictionary FOR SELECT USING (true);

DROP POLICY IF EXISTS "poster_categories_select" ON poster_categories;
CREATE POLICY "poster_categories_select" ON poster_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "poster_categories_insert" ON poster_categories;
CREATE POLICY "poster_categories_insert" ON poster_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "poster_regions_select" ON poster_regions;
CREATE POLICY "poster_regions_select" ON poster_regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "poster_regions_insert" ON poster_regions;
CREATE POLICY "poster_regions_insert" ON poster_regions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "poster_audiences_select" ON poster_audiences;
CREATE POLICY "poster_audiences_select" ON poster_audiences FOR SELECT USING (true);
DROP POLICY IF EXISTS "poster_audiences_insert" ON poster_audiences;
CREATE POLICY "poster_audiences_insert" ON poster_audiences FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "favorites_all" ON favorites;
CREATE POLICY "favorites_all" ON favorites FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_insert" ON comment_reports;
CREATE POLICY "reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);
DROP POLICY IF EXISTS "reports_select" ON comment_reports;
CREATE POLICY "reports_select" ON comment_reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);
DROP POLICY IF EXISTS "reports_update" ON comment_reports;
CREATE POLICY "reports_update" ON comment_reports FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

DROP POLICY IF EXISTS "admin_actions_all" ON admin_actions;
CREATE POLICY "admin_actions_all" ON admin_actions FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
);

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "search_logs_deny" ON search_logs;
CREATE POLICY "search_logs_deny" ON search_logs FOR SELECT USING (false);


-- ============================================================
-- 6. updated_at 트리거 (새 테이블에만, 중복 방지)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
    v_trigger_name TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema = 'public'
          AND table_name IN ('audience_groups')
    LOOP
        v_trigger_name := 'trg_updated_at_' || t;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE trigger_name = v_trigger_name AND event_object_table = t
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE ON %I '
                'FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()',
                v_trigger_name, t
            );
        END IF;
    END LOOP;
END;
$$;


-- ============================================================
-- 7. RPC 함수
-- ============================================================

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

CREATE OR REPLACE FUNCTION search_posters_with_synonyms(
    p_query TEXT,
    p_category_id UUID DEFAULT NULL,
    p_region_id UUID DEFAULT NULL
)
RETURNS SETOF posters AS $$
DECLARE
    v_search_terms TEXT[];
BEGIN
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

CREATE OR REPLACE FUNCTION get_popular_regions()
RETURNS TABLE (name TEXT, count INT) AS $$
BEGIN
    RETURN QUERY
    SELECT r.name, COUNT(pr.poster_id)::INT AS count
    FROM regions r
    JOIN poster_regions pr ON r.id = pr.region_id
    WHERE r.level = 'sido'
    GROUP BY r.id, r.name
    ORDER BY count DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
