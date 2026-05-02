DELETE FROM comment_reports
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY comment_id, reporter_user_id
        ORDER BY created_at ASC, id ASC
      ) AS duplicate_rank
    FROM comment_reports
  ) ranked_reports
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_unique_reporter_comment
  ON comment_reports(comment_id, reporter_user_id);

DROP POLICY IF EXISTS "reports_select_own" ON comment_reports;
CREATE POLICY "reports_select_own"
  ON comment_reports
  FOR SELECT
  USING (auth.uid() = reporter_user_id);
