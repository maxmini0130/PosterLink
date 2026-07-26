-- SNS_INGESTION.md Phase 3 후속 — notice_sightings가 이미 posters로 승격된
-- 공고에도 연결될 수 있도록 확장한다.
--
-- 배경: candidate_id는 poster_notice_candidates(id)만 참조하도록 Phase 1에서
-- 만들어졌는데, 실제로 네이버 블로그 인제스터를 마포구청 블로그로 E2E 테스트해보니
-- 블로그 글 1건이 이미 발행(published)된 posters 행과 정확히 매칭되는 사례가
-- 실제로 나왔다. 이 경우 지금까지는 로그만 남기고 링크를 못 했는데, 이 마이그레이션
-- 이후로는 poster_id로 실제 연결한다. sighting은 candidate_id 또는 poster_id 중
-- 하나만(혹은 둘 다 null — 아직 링크 전) 가진다.

ALTER TABLE notice_sightings
  ADD COLUMN IF NOT EXISTS poster_id UUID REFERENCES posters(id) ON DELETE SET NULL;

COMMENT ON COLUMN notice_sightings.poster_id IS
  '이미 이미지 검증까지 끝나 posters로 승격된 공고와 매칭된 경우의 연결. candidate_id(=poster_notice_candidates)와 배타적.';

CREATE INDEX IF NOT EXISTS idx_notice_sightings_poster_id
  ON notice_sightings(poster_id);

ALTER TABLE notice_sightings
  ADD CONSTRAINT notice_sightings_single_link_check
  CHECK (candidate_id IS NULL OR poster_id IS NULL);
