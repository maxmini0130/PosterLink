DROP POLICY IF EXISTS "site_visit_logs_insert" ON site_visit_logs;

CREATE POLICY "site_visit_logs_insert"
  ON site_visit_logs
  FOR INSERT
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND actor_type = 'visitor'
    AND is_automated = false
    AND automation_source IS NULL
  );
