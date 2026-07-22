CREATE TABLE IF NOT EXISTS poster_notice_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  source_url TEXT,
  title TEXT NOT NULL,
  source_org_name TEXT,
  summary_short TEXT,
  summary_long TEXT,
  candidate_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (candidate_status IN ('pending','drafting','converted','dismissed','archived')),
  candidate_type TEXT NOT NULL DEFAULT 'text_notice'
    CHECK (candidate_type IN ('text_notice','missing_image','needs_generated_poster')),
  source_site_id TEXT,
  collection_source_slug TEXT,
  board_name TEXT,
  category_name TEXT,
  notice_date TIMESTAMPTZ,
  application_start_at TIMESTAMPTZ,
  application_end_at TIMESTAMPTZ,
  reason TEXT,
  quality_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_verification JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_poster_id UUID,
  generated_poster_id UUID REFERENCES posters(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poster_notice_candidates_status_created
  ON poster_notice_candidates(candidate_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poster_notice_candidates_source
  ON poster_notice_candidates(collection_source_slug, created_at DESC);

DROP TRIGGER IF EXISTS update_poster_notice_candidates_updated_at ON poster_notice_candidates;
CREATE TRIGGER update_poster_notice_candidates_updated_at
  BEFORE UPDATE ON poster_notice_candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE poster_notice_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poster_notice_candidates_admin_all" ON poster_notice_candidates;
CREATE POLICY "poster_notice_candidates_admin_all"
  ON poster_notice_candidates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','super_admin')
    )
  );

ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_type_check
  CHECK (target_type IN ('poster','comment','user','report','category','region','collection_source','notice_candidate'));

WITH moved AS (
  INSERT INTO poster_notice_candidates (
    source_key,
    source_url,
    title,
    source_org_name,
    summary_short,
    summary_long,
    candidate_status,
    candidate_type,
    application_end_at,
    reason,
    field_verification,
    raw_payload,
    source_poster_id,
    created_at,
    updated_at
  )
  SELECT
    p.source_key,
    p.source_key,
    p.title,
    p.source_org_name,
    p.summary_short,
    p.summary_long,
    'pending',
    'text_notice',
    p.application_end_at,
    'migrated from imageless crawler review poster',
    COALESCE(p.field_verification, '{}'::jsonb),
    jsonb_build_object(
      'poster_id', p.id,
      'source_key', p.source_key,
      'poster_status', p.poster_status,
      'thumbnail_url', p.thumbnail_url
    ),
    p.id,
    p.created_at,
    now()
  FROM posters p
  WHERE p.source_key IS NOT NULL
    AND p.poster_status = 'review'
    AND p.thumbnail_url IS NULL
  ON CONFLICT (source_key) DO UPDATE SET
    source_url = COALESCE(EXCLUDED.source_url, poster_notice_candidates.source_url),
    title = EXCLUDED.title,
    source_org_name = EXCLUDED.source_org_name,
    summary_short = EXCLUDED.summary_short,
    summary_long = EXCLUDED.summary_long,
    application_end_at = EXCLUDED.application_end_at,
    reason = COALESCE(poster_notice_candidates.reason, EXCLUDED.reason),
    field_verification = EXCLUDED.field_verification,
    raw_payload = poster_notice_candidates.raw_payload || EXCLUDED.raw_payload,
    source_poster_id = COALESCE(poster_notice_candidates.source_poster_id, EXCLUDED.source_poster_id),
    updated_at = now()
  RETURNING source_key
)
DELETE FROM posters
WHERE source_key IN (SELECT source_key FROM moved)
  AND poster_status = 'review'
  AND thumbnail_url IS NULL;
