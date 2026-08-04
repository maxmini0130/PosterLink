-- PDF 개편 4단계: 공개 기관 디렉터리와 기관 팔로우.
-- 수집 채널(collection_sources)은 유지하고, 사용자에게 보여줄 기관 정본과 분리한다.
-- posters의 실제 주최기관, 게시·수집 출처, 신청 접수기관도 서로 다른 FK로 연결한다.

CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  institution_type TEXT,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  region_name TEXT,
  homepage_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'source_confirmed', 'verified')),
  trust_score NUMERIC(4,3)
    CHECK (trust_score IS NULL OR trust_score BETWEEN 0 AND 1),
  is_public BOOLEAN NOT NULL DEFAULT true,
  last_collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_normalized_name
  ON institutions (LOWER(BTRIM(name)));
CREATE INDEX IF NOT EXISTS idx_institutions_public_name
  ON institutions (is_public, name);
CREATE INDEX IF NOT EXISTS idx_institutions_region
  ON institutions (region_id, region_name);

DROP TRIGGER IF EXISTS update_institutions_updated_at ON institutions;
CREATE TRIGGER update_institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE collection_sources
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collection_sources_institution
  ON collection_sources(institution_id);
CREATE INDEX IF NOT EXISTS idx_posters_organizer_institution
  ON posters(organizer_id, poster_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posters_source_institution
  ON posters(source_institution_id, poster_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posters_application_institution
  ON posters(application_institution_id, poster_status, created_at DESC);

CREATE TABLE IF NOT EXISTS institution_follows (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_follows_institution
  ON institution_follows(institution_id, created_at DESC);

COMMENT ON TABLE institutions IS
  '사용자 탐색·팔로우용 기관 정본. 내부 수집 채널인 collection_sources와 분리한다.';
COMMENT ON COLUMN posters.organizer_id IS
  '사업·행사를 실제로 주최 또는 주관하는 기관. source_institution_id와 구분한다.';
COMMENT ON COLUMN posters.source_institution_id IS
  'PosterLink가 공고를 수집한 게시 출처 기관. 실제 주최기관을 뜻하지 않는다.';
COMMENT ON COLUMN posters.application_institution_id IS
  '신청을 실제로 접수하는 기관. 실제 주최기관과 다를 수 있다.';

-- 공개 수집 채널을 기관 디렉터리의 초기 인벤토리로 옮기되, 기관 검증 완료로 과장하지 않는다.
INSERT INTO institutions (
  slug,
  name,
  institution_type,
  region_name,
  homepage_url,
  verification_status,
  trust_score,
  is_public,
  last_collected_at
)
SELECT
  source_slug,
  name,
  source_type,
  region_name,
  homepage_url,
  'source_confirmed',
  CASE reliability WHEN 'high' THEN 0.950 WHEN 'medium' THEN 0.750 ELSE 0.500 END,
  is_public,
  last_success_at
FROM collection_sources
WHERE is_public = true
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  institution_type = EXCLUDED.institution_type,
  region_name = EXCLUDED.region_name,
  homepage_url = COALESCE(EXCLUDED.homepage_url, institutions.homepage_url),
  trust_score = EXCLUDED.trust_score,
  is_public = EXCLUDED.is_public,
  last_collected_at = EXCLUDED.last_collected_at,
  updated_at = now();

UPDATE collection_sources AS source
SET institution_id = institution.id
FROM institutions AS institution
WHERE institution.slug = source.source_slug
  AND source.institution_id IS DISTINCT FROM institution.id;

-- 사람 검증된 실제 주최·접수기관만 별도 정본으로 보충한다.
INSERT INTO institutions (slug, name, verification_status, trust_score, is_public)
SELECT
  'org-' || SUBSTRING(md5(LOWER(BTRIM(name))) FROM 1 FOR 16),
  name,
  'verified',
  1.000,
  true
FROM (
  SELECT DISTINCT organizer_name AS name
  FROM posters
  WHERE verification_status = 'verified' AND NULLIF(BTRIM(organizer_name), '') IS NOT NULL
  UNION
  SELECT DISTINCT application_organization_name AS name
  FROM posters
  WHERE verification_status = 'verified' AND NULLIF(BTRIM(application_organization_name), '') IS NOT NULL
) AS verified_names
ON CONFLICT DO NOTHING;

-- 수집 출처는 정확히 같은 채널명만 연결한다. 이를 실제 주최기관으로 복사하지 않는다.
UPDATE posters AS poster
SET source_institution_id = source.institution_id
FROM collection_sources AS source
WHERE source.institution_id IS NOT NULL
  AND LOWER(BTRIM(poster.source_org_name)) = LOWER(BTRIM(source.name))
  AND poster.source_institution_id IS NULL;

-- 실제 주최·접수기관 FK는 사람 검증 완료 공고만 연결한다.
UPDATE posters AS poster
SET organizer_id = institution.id
FROM institutions AS institution
WHERE poster.verification_status = 'verified'
  AND LOWER(BTRIM(poster.organizer_name)) = LOWER(BTRIM(institution.name))
  AND poster.organizer_id IS NULL;

UPDATE posters AS poster
SET application_institution_id = institution.id
FROM institutions AS institution
WHERE poster.verification_status = 'verified'
  AND LOWER(BTRIM(poster.application_organization_name)) = LOWER(BTRIM(institution.name))
  AND poster.application_institution_id IS NULL;

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institutions_public_select" ON institutions;
CREATE POLICY "institutions_public_select"
  ON institutions FOR SELECT
  USING (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "institutions_admin_write" ON institutions;
CREATE POLICY "institutions_admin_write"
  ON institutions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "institution_follows_own_select" ON institution_follows;
CREATE POLICY "institution_follows_own_select"
  ON institution_follows FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "institution_follows_own_insert" ON institution_follows;
CREATE POLICY "institution_follows_own_insert"
  ON institution_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "institution_follows_own_delete" ON institution_follows;
CREATE POLICY "institution_follows_own_delete"
  ON institution_follows FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
  CHECK (target_type IN (
    'poster','comment','user','report','category','region','collection_source',
    'notice_candidate','notice_sighting','institution'
  ));

CREATE OR REPLACE FUNCTION invalidate_verified_poster_institution_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.verification_status = 'verified'
    AND (
      OLD.organizer_id IS DISTINCT FROM NEW.organizer_id
      OR OLD.source_institution_id IS DISTINCT FROM NEW.source_institution_id
      OR OLD.application_institution_id IS DISTINCT FROM NEW.application_institution_id
    )
  THEN
    NEW.verification_status := 'needs_review';
    NEW.verified_at := NULL;
    NEW.field_verification := jsonb_set(
      COALESCE(NEW.field_verification, '{}'::jsonb),
      '{structuredVerificationInvalidation}',
      jsonb_build_object(
        'invalidatedAt', NOW(),
        'invalidatedBy', COALESCE(auth.uid()::text, 'service_role'),
        'reason', 'institution_relation_changed'
      ),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_verified_poster_institution_change ON posters;
CREATE TRIGGER trg_invalidate_verified_poster_institution_change
  BEFORE UPDATE OF organizer_id, source_institution_id, application_institution_id ON posters
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_verified_poster_institution_change();

CREATE OR REPLACE FUNCTION ensure_verified_institution(institution_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_name TEXT := NULLIF(BTRIM(institution_name), '');
  resolved_id UUID;
BEGIN
  IF normalized_name IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO resolved_id
  FROM institutions
  WHERE LOWER(BTRIM(name)) = LOWER(normalized_name)
  LIMIT 1;

  IF resolved_id IS NULL THEN
    INSERT INTO institutions (slug, name, verification_status, trust_score, is_public)
    VALUES (
      'org-' || SUBSTRING(md5(LOWER(normalized_name)) FROM 1 FOR 16),
      normalized_name,
      'verified',
      1.000,
      true
    )
    ON CONFLICT DO NOTHING;

    SELECT id INTO resolved_id
    FROM institutions
    WHERE LOWER(BTRIM(name)) = LOWER(normalized_name)
    LIMIT 1;
  ELSE
    UPDATE institutions
    SET verification_status = 'verified', trust_score = 1.000, updated_at = now()
    WHERE id = resolved_id
      AND verification_status IS DISTINCT FROM 'verified';
  END IF;

  RETURN resolved_id;
END;
$$;

CREATE OR REPLACE FUNCTION sync_verified_poster_institutions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_organizer_id UUID;
  resolved_application_id UUID;
  resolved_source_id UUID;
BEGIN
  IF NEW.verification_status <> 'verified' THEN
    RETURN NEW;
  END IF;

  resolved_organizer_id := ensure_verified_institution(NEW.organizer_name);
  resolved_application_id := ensure_verified_institution(NEW.application_organization_name);

  SELECT source.institution_id INTO resolved_source_id
  FROM collection_sources AS source
  WHERE source.institution_id IS NOT NULL
    AND LOWER(BTRIM(source.name)) = LOWER(BTRIM(NEW.source_org_name))
  LIMIT 1;

  UPDATE posters
  SET
    organizer_id = resolved_organizer_id,
    source_institution_id = resolved_source_id,
    application_institution_id = resolved_application_id
  WHERE id = NEW.id
    AND (
      organizer_id IS DISTINCT FROM resolved_organizer_id
      OR source_institution_id IS DISTINCT FROM resolved_source_id
      OR application_institution_id IS DISTINCT FROM resolved_application_id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_verified_poster_institutions ON posters;
CREATE TRIGGER trg_sync_verified_poster_institutions
  AFTER INSERT OR UPDATE OF verification_status, organizer_name, source_org_name, application_organization_name ON posters
  FOR EACH ROW
  WHEN (NEW.verification_status = 'verified')
  EXECUTE FUNCTION sync_verified_poster_institutions();
