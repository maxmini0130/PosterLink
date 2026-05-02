CREATE TABLE IF NOT EXISTS poster_view_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  visitor_key TEXT,
  referrer_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poster_view_logs_poster_created
  ON poster_view_logs(poster_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poster_view_logs_user_created
  ON poster_view_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poster_view_logs_visitor_created
  ON poster_view_logs(visitor_key, created_at DESC)
  WHERE visitor_key IS NOT NULL;

ALTER TABLE poster_view_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poster_view_logs_insert" ON poster_view_logs;
CREATE POLICY "poster_view_logs_insert"
  ON poster_view_logs
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "poster_view_logs_select_admin" ON poster_view_logs;
CREATE POLICY "poster_view_logs_select_admin"
  ON poster_view_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
