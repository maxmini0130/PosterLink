-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('user', 'operator', 'admin', 'super_admin');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'unknown', 'prefer_not_to_say');
CREATE TYPE age_band_type AS ENUM ('teen', '20s', '30s', '40s', '50s', '60_plus', 'unknown');
CREATE TYPE region_level AS ENUM ('nation', 'sido', 'sigungu', 'eupmyeondong');
CREATE TYPE poster_status AS ENUM ('draft', 'review_requested', 'published', 'hidden', 'rejected', 'expired');
CREATE TYPE comment_status AS ENUM ('normal', 'hidden', 'deleted', 'blocked');
CREATE TYPE comment_type AS ENUM ('question', 'review', 'info', 'correction', 'general');

-- 2. TABLES

-- Regions (기준정보: 지역)
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (사용자 프로필 - Auth.users와 1:1)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname VARCHAR(50) UNIQUE,
    role user_role DEFAULT 'user' NOT NULL,
    gender gender_type DEFAULT 'unknown',
    age_band age_band_type DEFAULT 'unknown',
    primary_region_id UUID REFERENCES regions(id),
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Interest Categories
CREATE TABLE user_interest_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, category_id)
);

-- Posters (포스터 핵심 데이터)
CREATE TABLE posters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    status poster_status DEFAULT 'draft' NOT NULL,
    is_featured BOOLEAN DEFAULT false,
    favorite_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Poster Images
CREATE TABLE poster_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    image_type VARCHAR(50) NOT NULL, -- original, corrected, thumbnail
    storage_path TEXT NOT NULL,
    width INT,
    height INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Poster Links
CREATE TABLE poster_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL, -- official_notice, official_apply, etc.
    title VARCHAR(255),
    url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Poster Favorites
CREATE TABLE poster_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, poster_id)
);

-- Comments
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    comment_type comment_type DEFAULT 'general',
    body TEXT NOT NULL,
    status comment_status DEFAULT 'normal' NOT NULL,
    is_official BOOLEAN DEFAULT false,
    like_count INT DEFAULT 0,
    report_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Admin Actions (운영 로그)
CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES auth.users(id),
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_reason TEXT,
    metadata_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TRIGGERS FOR updated_at
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

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posters ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_favorites ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Posters Policies
CREATE POLICY "Published posters are viewable by everyone" ON posters FOR SELECT USING (status = 'published');
CREATE POLICY "Operators and Admins can view all posters" ON posters FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('operator', 'admin', 'super_admin'))
);
CREATE POLICY "Operators can insert posters" ON posters FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('operator', 'admin', 'super_admin'))
);

-- Favorites Policies
CREATE POLICY "Users can view own favorites" ON poster_favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON poster_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON poster_favorites FOR DELETE USING (auth.uid() = user_id);

-- Comments Policies
CREATE POLICY "Normal comments are viewable by everyone" ON comments FOR SELECT USING (status = 'normal');
CREATE POLICY "Users can insert own comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON comments FOR UPDATE USING (auth.uid() = user_id);

-- 5. INDEXES
CREATE INDEX idx_posters_status ON posters(status);
CREATE INDEX idx_posters_category ON posters(category_id);
CREATE INDEX idx_posters_region ON posters(primary_region_id);
CREATE INDEX idx_posters_application_end ON posters(application_end_at);
CREATE INDEX idx_comments_poster ON comments(poster_id);
CREATE INDEX idx_poster_favorites_user ON poster_favorites(user_id);
