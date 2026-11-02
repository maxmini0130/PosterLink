-- Admin comment moderation, unapplied to production.
-- /admin/reports "댓글 숨김" and the question/review "숨김 처리·다시 표시"
-- update comments.status as the signed-in admin, but comments only had
-- owner UPDATE policies: the update matched 0 rows, the screen reported
-- success and the reported comment stayed public (full test 2026-11-02).
-- This adds an UPDATE policy for admin/super_admin, the same check that
-- comment_reports.reports_update already uses. Owners keep their policies.
DROP POLICY IF EXISTS comments_admin_moderate ON public.comments;
CREATE POLICY comments_admin_moderate ON public.comments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])
    )
  );
-- No data change. Rollback after approval:
--   DROP POLICY IF EXISTS comments_admin_moderate ON public.comments;
