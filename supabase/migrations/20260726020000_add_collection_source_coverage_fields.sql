-- SNS_INGESTION.md Phase 4 — 기관 커버리지 맵.
--
-- Phase 1에서 collection_sources를 문서의 "institutions" 채널 인벤토리 역할로
-- 쓰기로 했으므로(별도 institutions 테이블 신설 대신), 여기에 필요한 컬럼만 추가한다.

ALTER TABLE collection_sources
  ADD COLUMN IF NOT EXISTS naver_blog_id TEXT,
  ADD COLUMN IF NOT EXISTS facebook_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_id TEXT,
  ADD COLUMN IF NOT EXISTS coverage_grade TEXT
    CHECK (coverage_grade IN ('게시판완결','게시판부실','SNS-only')),
  ADD COLUMN IF NOT EXISTS sns_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN collection_sources.coverage_grade IS
  '게시판완결(SNS 불필요) | 게시판부실(SNS 보완 필요) | SNS-only(게시판에 없음). '
  'measure-institution-coverage.js가 board/blog 공고 건수·겹침을 계산해 산출.';
COMMENT ON COLUMN collection_sources.sns_enabled IS
  '이 기관에 SNS(블로그 등) 수집을 켤지. naver-blog-ingester.js의 배치 모드가 이 플래그를 존중한다.';

CREATE INDEX IF NOT EXISTS idx_collection_sources_sns_enabled
  ON collection_sources(sns_enabled) WHERE sns_enabled = true;
