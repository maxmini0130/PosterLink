-- 1. Categories (기본 카테고리)
INSERT INTO categories (name, code, sort_order) VALUES
('지원금/복지', 'CAT_WELFARE', 1),
('교육/취업', 'CAT_EDUCATION', 2),
('문화/행사', 'CAT_CULTURE', 3),
('주거/금융', 'CAT_HOUSING', 4),
('소상공인', 'CAT_BUSINESS', 5),
('육아/가족', 'CAT_FAMILY', 6),
('건강/의료', 'CAT_HEALTH', 7),
('기타', 'CAT_OTHER', 8)
ON CONFLICT (code) DO NOTHING;

-- 2. Regions (기본 지역 - 전국 및 주요 시도)
INSERT INTO regions (name, code, level, full_name) VALUES
('전국', 'REG_NATION', 'nation', '전국'),
('서울특별시', 'REG_SEOUL', 'sido', '서울특별시'),
('경기도', 'REG_GYEONGGI', 'sido', '경기도'),
('인천광역시', 'REG_INCHEON', 'sido', '인천광역시'),
('부산광역시', 'REG_BUSAN', 'sido', '부산광역시'),
('대구광역시', 'REG_DAEGU', 'sido', '대구광역시'),
('광주광역시', 'REG_GWANGJU', 'sido', '광주광역시'),
('대전광역시', 'REG_DAEJEON', 'sido', '대전광역시'),
('울산광역시', 'REG_ULSAN', 'sido', '울산광역시'),
('세종특별자치시', 'REG_SEJONG', 'sido', '세종특별자치시')
ON CONFLICT (code) DO NOTHING;

-- 3. Sample Sub-Regions (서울 주요 구)
DO $$
DECLARE
    seoul_id UUID;
BEGIN
    SELECT id INTO seoul_id FROM regions WHERE code = 'REG_SEOUL';
    
    INSERT INTO regions (parent_id, name, code, level, full_name) VALUES
    (seoul_id, '강남구', 'REG_SEOUL_GANGNAM', 'sigungu', '서울특별시 강남구'),
    (seoul_id, '서초구', 'REG_SEOUL_SEOCHO', 'sigungu', '서울특별시 서초구'),
    (seoul_id, '송파구', 'REG_SEOUL_SONGPA', 'sigungu', '서울특별시 송파구'),
    (seoul_id, '마포구', 'REG_SEOUL_MAPO', 'sigungu', '서울특별시 마포구'),
    (seoul_id, '종로구', 'REG_SEOUL_JONGNO', 'sigungu', '서울특별시 종로구')
    ON CONFLICT (code) DO NOTHING;
END $$;

-- 4. Eligibility Tags (대상 조건 태그)
-- Note: age_band_type ENUM values: 'teen', '20s', '30s', '40s', '50s', '60_plus', 'unknown'
-- We can add descriptive names or logic-friendly codes here.
-- Assuming we might add an eligibility_tags table if needed, 
-- but for now, we follow docs/05_data_model.md's eligibility_tags.

/* 
-- (Migration script already created this if needed, but if not, let's stick to core for now)
CREATE TABLE IF NOT EXISTS eligibility_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
*/

-- Let's add basic eligibility tags if the table exists (it was in 05_data_model.md but not in my initial migration)
-- I will add it to a new migration first to be safe, or just provide the data here assuming it's managed.
-- Given I'm in Step 3, I'll just provide core data for what we have.
