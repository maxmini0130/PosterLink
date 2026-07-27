-- SNS_INGESTION.md 8-3 후속 — 이미지 phash 중복제거 + 대표이미지(해상도 우선) 자동선정.
--
-- notice_sightings.image_phash 컬럼(Phase 1)은 있었지만 실제로 채우는 로직이 없었다.
-- 대표이미지 선정 시 "해상도가 더 큰 쪽"을 매번 다시 다운로드해 계산하지 않도록,
-- phash 계산과 함께 이미지 원본 가로/세로 픽셀도 저장해둔다.

ALTER TABLE notice_sightings
  ADD COLUMN IF NOT EXISTS image_width INTEGER,
  ADD COLUMN IF NOT EXISTS image_height INTEGER;

COMMENT ON COLUMN notice_sightings.image_width IS
  'image-phash.js가 계산한 원본 이미지 가로 픽셀. 대표이미지(해상도 우선) 선정에 사용.';
COMMENT ON COLUMN notice_sightings.image_height IS
  'image-phash.js가 계산한 원본 이미지 세로 픽셀. 대표이미지(해상도 우선) 선정에 사용.';
