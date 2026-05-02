CREATE TABLE IF NOT EXISTS poster_link_click_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID REFERENCES posters(id) ON DELETE CASCADE,
  link_id UUID REFERENCES poster_links(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  link_type TEXT,
  link_url TEXT NOT NULL,
  referrer_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poster_link_click_logs_poster_created
  ON poster_link_click_logs(poster_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poster_link_click_logs_link_created
  ON poster_link_click_logs(link_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poster_link_click_logs_user_created
  ON poster_link_click_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE poster_link_click_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poster_link_click_logs_insert" ON poster_link_click_logs;
CREATE POLICY "poster_link_click_logs_insert"
  ON poster_link_click_logs
  FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "poster_link_click_logs_select_admin" ON poster_link_click_logs;
CREATE POLICY "poster_link_click_logs_select_admin"
  ON poster_link_click_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
