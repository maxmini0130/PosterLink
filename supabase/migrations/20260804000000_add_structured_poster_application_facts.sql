-- PosterLink 1차 개편: 게시 공고의 신청 판단용 구조화 필드
--
-- URL은 기존 poster_links(official_notice / official_apply)를 정본으로 사용하고,
-- 지역과 카테고리는 기존 poster_regions / poster_categories를 재사용한다.
-- 기존 데이터에 영향을 주지 않도록 신규 필드는 nullable로 추가한다.

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS organizer_name TEXT,
  ADD COLUMN IF NOT EXISTS application_organization_name TEXT,
  ADD COLUMN IF NOT EXISTS deadline_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (deadline_type IN ('fixed', 'ongoing', 'until_exhausted', 'scheduled', 'unknown')),
  ADD COLUMN IF NOT EXISTS event_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eligibility_summary TEXT,
  ADD COLUMN IF NOT EXISTS target_age_min SMALLINT
    CHECK (target_age_min IS NULL OR target_age_min BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS target_age_max SMALLINT
    CHECK (target_age_max IS NULL OR target_age_max BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS participation_fee TEXT,
  ADD COLUMN IF NOT EXISTS benefits_summary TEXT,
  ADD COLUMN IF NOT EXISTS recruitment_count TEXT,
  ADD COLUMN IF NOT EXISTS application_method TEXT,
  ADD COLUMN IF NOT EXISTS required_documents TEXT,
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS event_location TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'needs_review', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS data_confidence NUMERIC(4,3)
    CHECK (data_confidence IS NULL OR data_confidence BETWEEN 0 AND 1);

ALTER TABLE posters
  DROP CONSTRAINT IF EXISTS posters_target_age_range_check;

ALTER TABLE posters
  ADD CONSTRAINT posters_target_age_range_check
  CHECK (
    target_age_min IS NULL
    OR target_age_max IS NULL
    OR target_age_min <= target_age_max
  );

CREATE INDEX IF NOT EXISTS idx_posters_verification_status
  ON posters(verification_status, poster_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posters_verified_at
  ON posters(verified_at DESC)
  WHERE verified_at IS NOT NULL;

COMMENT ON COLUMN posters.organizer_name IS
  '사업·행사를 실제로 주최 또는 주관하는 기관명. 수집 출처인 source_org_name과 구분한다.';
COMMENT ON COLUMN posters.application_organization_name IS
  '신청을 실제로 접수하는 기관명. 실제 주관기관과 다를 수 있다.';
COMMENT ON COLUMN posters.deadline_type IS
  'fixed=고정 마감, ongoing=명시적 상시, until_exhausted=소진 시, scheduled=예정, unknown=미확인.';
COMMENT ON COLUMN posters.verification_status IS
  '데이터 검증 상태. 공개 수명주기인 poster_status와 별도로 관리한다.';
COMMENT ON COLUMN posters.verified_at IS
  '원문과 구조화 필드를 마지막으로 검증 완료한 시각. 단순 updated_at과 구분한다.';
COMMENT ON COLUMN posters.data_confidence IS
  '공고 전체 데이터의 요약 신뢰도. 항목별 신뢰도와 근거는 field_verification JSONB에 보관한다.';
