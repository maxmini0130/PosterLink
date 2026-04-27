-- 외부 공공데이터 수집 시 중복 방지용 식별자
ALTER TABLE posters ADD COLUMN IF NOT EXISTS source_key TEXT UNIQUE;

COMMENT ON COLUMN posters.source_key IS '공공데이터 수집 시 외부 식별자 (예: youth_bizId, bokjiro_servId). 중복 수집 방지용.';
