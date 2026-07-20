CREATE TABLE IF NOT EXISTS collection_source_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES collection_sources(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  source_name TEXT,
  run_phase TEXT NOT NULL DEFAULT 'collection'
    CHECK (run_phase IN ('crawl','upload','collection')),
  run_status TEXT NOT NULL
    CHECK (run_status IN ('success','partial','error','empty')),
  checked_count INTEGER DEFAULT 0 CHECK (checked_count >= 0),
  new_count INTEGER DEFAULT 0 CHECK (new_count >= 0),
  valid_count INTEGER DEFAULT 0 CHECK (valid_count >= 0),
  duplicate_count INTEGER DEFAULT 0 CHECK (duplicate_count >= 0),
  rejected_count INTEGER DEFAULT 0 CHECK (rejected_count >= 0),
  failed_count INTEGER DEFAULT 0 CHECK (failed_count >= 0),
  missing_required_count INTEGER DEFAULT 0 CHECK (missing_required_count >= 0),
  valid_post_rate NUMERIC(5,2) DEFAULT 0 CHECK (valid_post_rate >= 0 AND valid_post_rate <= 100),
  required_field_missing_rate NUMERIC(5,2) DEFAULT 0 CHECK (required_field_missing_rate >= 0 AND required_field_missing_rate <= 100),
  latest_post_found_at TIMESTAMPTZ,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ DEFAULT now(),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_source_runs_source_created
  ON collection_source_runs(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_source_runs_status_created
  ON collection_source_runs(run_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_source_runs_created
  ON collection_source_runs(created_at DESC);

ALTER TABLE collection_source_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_source_runs_admin_select" ON collection_source_runs;
CREATE POLICY "collection_source_runs_admin_select"
  ON collection_source_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "collection_source_runs_admin_write" ON collection_source_runs;
CREATE POLICY "collection_source_runs_admin_write"
  ON collection_source_runs
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
