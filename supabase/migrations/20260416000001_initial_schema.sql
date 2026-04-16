-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMS
CREATE TYPE poster_status AS ENUM ('draft', 'review', 'published', 'hidden', 'closed');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'unknown');
CREATE TYPE region_level AS ENUM ('nation', 'sido', 'sigungu', 'eupmyeondong');
CREATE TYPE comment_status AS ENUM ('normal', 'hidden', 'deleted', 'blocked');
CREATE TYPE report_status AS ENUM ('received', 'reviewing', 'actioned', 'dismissed');

-- 2. TABLES

-- Regions (기준정보: 지역)
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES regions(id),
    level region_level NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories (기준정보: 카테고리)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES categories(id),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (사용자 프로필)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname VARCHAR(50) UNIQUE,
    gender gender_type DEFAULT 'unknown',
    age_band VARCHAR(20),
    primary_region_id UUID REFERENCES regions(id),
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Posters (포스터 핵심 데이터)
CREATE TABLE posters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    source_org_name VARCHAR(100),
    summary_short TEXT,
    summary_long TEXT,
    category_id UUID REFERENCES categories(id),
    primary_region_id UUID REFERENCES regions(id),
    exposure_start_at TIMESTAMPTZ,
    exposure_end_at TIMESTAMPTZ,
    application_start_at TIMESTAMPTZ,
    application_end_at TIMESTAMPTZ,
    status poster_status DEFAULT 'draft',
    is_featured BOOLEAN DEFAULT false,
    favorite_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Poster Links (관련 링크)
CREATE TABLE poster_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL, -- official_notice, official_apply, etc.
    title VARCHAR(255),
    url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Favorites (찜하기)
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, poster_id)
);

-- Comments (댓글 및 질문/후기)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    status comment_status DEFAULT 'normal',
    is_official BOOLEAN DEFAULT false,
    report_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Comment Reports (댓글 신고)
CREATE TABLE comment_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES auth.users(id),
    reason_code VARCHAR(50) NOT NULL,
    reason_detail TEXT,
    status report_status DEFAULT 'received',
    handled_by UUID REFERENCES auth.users(id),
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Operator Uploads (운영자 이미지 업로드 이력)
CREATE TABLE operator_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id UUID REFERENCES auth.users(id),
    original_image_path TEXT NOT NULL,
    processed_image_path TEXT,
    ocr_raw_result JSONB,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processed, linked
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Moderation Logs (관리자 활동 로그)
CREATE TABLE moderation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES auth.users(id),
    target_type VARCHAR(50) NOT NULL, -- poster, comment, user
    target_id UUID NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- hide, delete, approve, etc.
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_posters_updated_at BEFORE UPDATE ON posters FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 4. INDEXES
CREATE INDEX idx_posters_status ON posters(status);
CREATE INDEX idx_posters_category ON posters(category_id);
CREATE INDEX idx_posters_region ON posters(primary_region_id);
CREATE INDEX idx_posters_app_end ON posters(application_end_at);
CREATE INDEX idx_comments_poster ON comments(poster_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_favorites_user ON favorites(user_id);

-- 5. ROW LEVEL SECURITY (RLS)

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posters ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_logs ENABLE ROW LEVEL SECURITY;

-- Policies: Profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Policies: Posters
CREATE POLICY "Published posters are viewable by everyone" ON posters FOR SELECT USING (status = 'published');
CREATE POLICY "Operators can view all posters" ON posters FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND age_band = 'operator')); -- Placeholder for role check

-- Policies: Favorites
CREATE POLICY "Users can view own favorites" ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING (auth.uid() = user_id);

-- Policies: Comments
CREATE POLICY "Normal comments are viewable by everyone" ON comments FOR SELECT USING (status = 'normal');
CREATE POLICY "Users can insert own comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update/delete own comments" ON comments FOR ALL USING (auth.uid() = user_id);
