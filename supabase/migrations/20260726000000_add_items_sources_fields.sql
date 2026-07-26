-- SNS_INGESTION.md Phase 1 — 스키마 & 마이그레이션
--
-- 설계 원안은 새 items/sources 테이블을 만들자고 하지만, 이미 같은 역할을 하는
-- 기존 테이블이 있어(파괴적 변경 대신) 확장한다:
--   - items(엔티티 정본)  → poster_notice_candidates 확장 (신규 컬럼만 추가)
--   - sources(출처 목격)  → notice_sightings 신규 생성 (1:N, 여기엔 대응 기존 테이블 없음)
--   - institutions(채널 인벤토리, Phase 4용) → collection_sources 그대로 재사용, 이 마이그레이션에서 손대지 않음
--
-- 레포 관례를 따라 Postgres native enum 대신 TEXT + CHECK 제약을 쓴다
-- (기존 마이그레이션 전체가 이 패턴이고, enum은 이 레포에 전혀 없음).

-- ============================================================
-- 1. poster_notice_candidates 확장 (= items)
-- ============================================================

ALTER TABLE poster_notice_candidates
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT '공고'
    CHECK (content_type IN ('공고','소식')),
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('지원사업','채용','공모전','교육강좌','행사모집','입찰','정책안내','보도자료','생활정보','기타')),
  ADD COLUMN IF NOT EXISTS org_code TEXT,
  ADD COLUMN IF NOT EXISTS region_sido TEXT,
  ADD COLUMN IF NOT EXISTS region_sigungu TEXT,
  ADD COLUMN IF NOT EXISTS region_code TEXT,
  ADD COLUMN IF NOT EXISTS target TEXT,
  ADD COLUMN IF NOT EXISTS support_scale TEXT,
  ADD COLUMN IF NOT EXISTS deadline_type TEXT
    CHECK (deadline_type IN ('고정','소진시','상시','예정')),
  ADD COLUMN IF NOT EXISTS apply_url TEXT,
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS representative_image TEXT,
  ADD COLUMN IF NOT EXISTS application_status TEXT NOT NULL DEFAULT '접수전'
    CHECK (application_status IN ('접수전','접수중','마감'));

COMMENT ON COLUMN poster_notice_candidates.content_type IS
  '공고(마감/신청 있음) vs 소식(액션 없지만 지역민에 유용). SNS_INGESTION.md 분류기 라우팅 결과.';
COMMENT ON COLUMN poster_notice_candidates.application_status IS
  '접수전/접수중/마감 — candidate_status(검수 워크플로)와 별개로 마감일 기준 자동 계산되는 상태.';

-- 마감임박 정렬 / 지역 필터 / 공고·소식 분리 조회
CREATE INDEX IF NOT EXISTS idx_notice_candidates_appstatus_deadline
  ON poster_notice_candidates(application_status, application_end_at);

CREATE INDEX IF NOT EXISTS idx_notice_candidates_region_code
  ON poster_notice_candidates(region_code);

CREATE INDEX IF NOT EXISTS idx_notice_candidates_content_type
  ON poster_notice_candidates(content_type);

-- ============================================================
-- 2. notice_sightings 신규 생성 (= sources, items에 N:1)
-- ============================================================

CREATE TABLE IF NOT EXISTS notice_sightings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID REFERENCES poster_notice_candidates(id) ON DELETE SET NULL,
  surface_type          TEXT NOT NULL
    CHECK (surface_type IN ('게시판','네이버블로그','페이스북','인스타그램')),
  source_url            TEXT NOT NULL,
  source_org            TEXT,
  raw_title             TEXT,
  raw_body              TEXT,
  ocr_text              TEXT,
  image_url             TEXT,
  image_phash           TEXT,
  source_priority        INTEGER NOT NULL CHECK (source_priority > 0),
  extraction_confidence  NUMERIC(3,2) CHECK (extraction_confidence BETWEEN 0 AND 1),
  crawled_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (surface_type, source_url)
);

COMMENT ON TABLE notice_sightings IS
  '같은 공고를 게시판/블로그/SNS 등 여러 출처에서 목격한 기록. candidate_id로 poster_notice_candidates(=items)에 N:1 연결. '
  'source_priority 관례: 게시판원문=1 > 네이버블로그=2 > 인스타그램/페이스북=3 (병합 시 우선순위, Phase 3).';

CREATE INDEX IF NOT EXISTS idx_notice_sightings_candidate
  ON notice_sightings(candidate_id);

CREATE INDEX IF NOT EXISTS idx_notice_sightings_phash
  ON notice_sightings(image_phash);

DROP TRIGGER IF EXISTS update_notice_sightings_updated_at ON notice_sightings;
CREATE TRIGGER update_notice_sightings_updated_at
  BEFORE UPDATE ON notice_sightings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notice_sightings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notice_sightings_admin_all" ON notice_sightings;
CREATE POLICY "notice_sightings_admin_all"
  ON notice_sightings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );

-- admin_actions에서 notice_sighting도 대상으로 남길 수 있도록 허용
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_type_check
  CHECK (target_type IN ('poster','comment','user','report','category','region','collection_source','notice_candidate','notice_sighting'));

-- ============================================================
-- 3. application_status 자동 전환 (접수전 → 접수중 → 마감)
-- ============================================================
-- close_expired_posters()(20260724000000)와 같은 스타일.
-- 상시: 마감 없음(수동/외부 신호로만 마감). 소진시: apply_end 없으면 자동 마감 판단 불가 → 수동/외부 신호 대기.

CREATE OR REPLACE FUNCTION public.update_notice_candidate_application_status()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.poster_notice_candidates
  SET application_status = CASE
        WHEN application_start_at IS NOT NULL AND application_start_at > now()
          THEN '접수전'
        WHEN deadline_type = '상시'
          THEN '접수중'
        WHEN deadline_type = '소진시'
          THEN '접수중'
        WHEN application_end_at IS NOT NULL AND application_end_at < date_trunc('day', now())
          THEN '마감'
        ELSE '접수중'
      END,
      updated_at = now()
  WHERE application_status IS DISTINCT FROM (
        CASE
          WHEN application_start_at IS NOT NULL AND application_start_at > now()
            THEN '접수전'
          WHEN deadline_type = '상시'
            THEN '접수중'
          WHEN deadline_type = '소진시'
            THEN '접수중'
          WHEN application_end_at IS NOT NULL AND application_end_at < date_trunc('day', now())
            THEN '마감'
          ELSE '접수중'
        END
      );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

SELECT cron.unschedule('update-notice-candidate-status-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-notice-candidate-status-daily'
);

-- 매일 오전 9시 10분 KST (= UTC 00:10). 기존 마감알림(00:00)·포스터 자동마감(00:05)과 안 겹치게 10분 뒤.
SELECT cron.schedule(
  'update-notice-candidate-status-daily',
  '10 0 * * *',
  $$ SELECT public.update_notice_candidate_application_status(); $$
);

-- 배포 시점 기존 400건 백로그도 즉시 정정
SELECT public.update_notice_candidate_application_status();
