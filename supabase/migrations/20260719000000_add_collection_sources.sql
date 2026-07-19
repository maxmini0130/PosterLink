CREATE TABLE IF NOT EXISTS collection_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'other'
    CHECK (source_type IN (
      'central_portal',
      'local_government',
      'foundation',
      'youth_center',
      'startup',
      'welfare',
      'culture',
      'education',
      'library',
      'sports',
      'university',
      'public_employment',
      'open_data',
      'other'
    )),
  region_scope TEXT DEFAULT 'national',
  region_name TEXT,
  homepage_url TEXT,
  list_url TEXT NOT NULL,
  collection_method TEXT NOT NULL DEFAULT 'html'
    CHECK (collection_method IN ('api','rss','json','html','attachment','manual','mixed')),
  collection_interval_minutes INTEGER DEFAULT 1440 CHECK (collection_interval_minutes > 0),
  priority INTEGER DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','paused','error','blocked','retired')),
  reliability TEXT NOT NULL DEFAULT 'medium'
    CHECK (reliability IN ('high','medium','low')),
  is_public BOOLEAN DEFAULT true,
  manager_contact TEXT,
  monthly_expected_posts INTEGER DEFAULT 0 CHECK (monthly_expected_posts >= 0),
  valid_post_rate NUMERIC(5,2) DEFAULT 0 CHECK (valid_post_rate >= 0 AND valid_post_rate <= 100),
  last_collected_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  latest_post_found_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  consecutive_error_count INTEGER DEFAULT 0 CHECK (consecutive_error_count >= 0),
  last_run_status TEXT,
  last_run_checked_count INTEGER DEFAULT 0 CHECK (last_run_checked_count >= 0),
  last_run_new_count INTEGER DEFAULT 0 CHECK (last_run_new_count >= 0),
  last_run_valid_count INTEGER DEFAULT 0 CHECK (last_run_valid_count >= 0),
  last_run_duplicate_count INTEGER DEFAULT 0 CHECK (last_run_duplicate_count >= 0),
  last_run_rejected_count INTEGER DEFAULT 0 CHECK (last_run_rejected_count >= 0),
  average_delay_hours NUMERIC(8,2),
  required_field_missing_rate NUMERIC(5,2) DEFAULT 0 CHECK (required_field_missing_rate >= 0 AND required_field_missing_rate <= 100),
  config_json JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_sources_status
  ON collection_sources(status, priority DESC, name);

CREATE INDEX IF NOT EXISTS idx_collection_sources_type
  ON collection_sources(source_type, status);

CREATE INDEX IF NOT EXISTS idx_collection_sources_last_success
  ON collection_sources(last_success_at DESC NULLS LAST);

ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_type_check
  CHECK (target_type IN ('poster','comment','user','report','category','region','collection_source'));

DROP TRIGGER IF EXISTS update_collection_sources_updated_at ON collection_sources;
CREATE TRIGGER update_collection_sources_updated_at
  BEFORE UPDATE ON collection_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE collection_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_sources_admin_select" ON collection_sources;
CREATE POLICY "collection_sources_admin_select"
  ON collection_sources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "collection_sources_admin_write" ON collection_sources;
CREATE POLICY "collection_sources_admin_write"
  ON collection_sources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

INSERT INTO collection_sources (
  source_slug,
  name,
  source_type,
  region_scope,
  region_name,
  homepage_url,
  list_url,
  collection_method,
  collection_interval_minutes,
  priority,
  status,
  reliability,
  monthly_expected_posts,
  notes
) VALUES
  (
    'bizinfo',
    '기업마당',
    'central_portal',
    'national',
    '전국',
    'https://www.bizinfo.go.kr',
    'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do',
    'html',
    360,
    95,
    'planned',
    'high',
    120,
    '중소기업·소상공인 지원사업, 행사, 입주기업 모집 우선 후보'
  ),
  (
    'k-startup',
    'K-Startup',
    'startup',
    'national',
    '전국',
    'https://www.k-startup.go.kr',
    'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do',
    'html',
    360,
    92,
    'planned',
    'high',
    80,
    '창업지원사업과 모집공고 우선 후보'
  ),
  (
    'youthcenter',
    '온통청년',
    'central_portal',
    'national',
    '전국',
    'https://www.youthcenter.go.kr',
    'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do',
    'html',
    360,
    90,
    'planned',
    'high',
    80,
    '청년 일자리·주거·교육·복지 정책 통합 후보'
  ),
  (
    'youth-seoul',
    '청년몽땅정보통',
    'central_portal',
    'sido',
    '서울특별시',
    'https://youth.seoul.go.kr',
    'https://youth.seoul.go.kr/infoData/sprtInfo/list.do',
    'html',
    360,
    88,
    'active',
    'medium',
    100,
    '서울 청년정책 통합 수집원. 제목·이미지 품질검수 강화 대상'
  ),
  (
    'job-alio',
    'JOB-ALIO',
    'public_employment',
    'national',
    '전국',
    'https://job.alio.go.kr',
    'https://job.alio.go.kr/recruit.do',
    'html',
    720,
    72,
    'planned',
    'medium',
    60,
    '공공기관 채용은 PosterLink 대상 여부를 별도 판단'
  ),
  (
    'data-portal',
    '공공데이터포털',
    'open_data',
    'national',
    '전국',
    'https://www.data.go.kr',
    'https://www.data.go.kr',
    'api',
    1440,
    65,
    'planned',
    'medium',
    0,
    '기관별 API 존재 여부 탐색용'
  ),
  (
    'mapo-gu',
    '마포구청',
    'local_government',
    'sigungu',
    '서울특별시 마포구',
    'https://www.mapo.go.kr',
    'https://www.mapo.go.kr/site/main/board/notice/list',
    'html',
    720,
    82,
    'active',
    'medium',
    20,
    '마포구 지역 공고 핵심 수집원'
  ),
  (
    'mapo-culture-foundation',
    '마포문화재단',
    'foundation',
    'sigungu',
    '서울특별시 마포구',
    'https://www.mfac.or.kr',
    'https://www.mfac.or.kr/communication/notice',
    'html',
    720,
    78,
    'active',
    'medium',
    12,
    '문화행사·교육 프로그램 후보'
  )
ON CONFLICT (source_slug) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  region_scope = EXCLUDED.region_scope,
  region_name = EXCLUDED.region_name,
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  collection_method = EXCLUDED.collection_method,
  collection_interval_minutes = EXCLUDED.collection_interval_minutes,
  priority = EXCLUDED.priority,
  reliability = EXCLUDED.reliability,
  monthly_expected_posts = EXCLUDED.monthly_expected_posts,
  notes = EXCLUDED.notes,
  updated_at = now();
