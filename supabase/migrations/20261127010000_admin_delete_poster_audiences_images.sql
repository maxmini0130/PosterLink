-- ============================================================
-- Admin delete policies for poster_audiences and poster_images
--
-- Why: the admin "AI 반영 확인" screen (/admin/ai-review-checks) reverts an
-- automatic AI source review with the admin's own session (RLS applies, no
-- service role). Reverting removes audience tags the review added. Neither
-- table had a DELETE policy, so RLS silently deleted nothing.
-- poster_images gets the same policy so an admin can remove a non-poster
-- image relation from the same screen later; the revert itself only inserts
-- images.
--
-- Scope: admins and super admins only (poster owners are not included,
-- unlike poster_links_delete in 20260422000000).
--
-- Check after applying:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('poster_audiences', 'poster_images')
--     AND cmd = 'DELETE';
--   -- expect poster_audiences_admin_delete and poster_images_admin_delete
--
-- Rollback:
--   DROP POLICY IF EXISTS "poster_audiences_admin_delete" ON poster_audiences;
--   DROP POLICY IF EXISTS "poster_images_admin_delete" ON poster_images;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

DROP POLICY IF EXISTS "poster_audiences_admin_delete" ON poster_audiences;
CREATE POLICY "poster_audiences_admin_delete" ON poster_audiences FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin','super_admin')
    )
);

DROP POLICY IF EXISTS "poster_images_admin_delete" ON poster_images;
CREATE POLICY "poster_images_admin_delete" ON poster_images FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin','super_admin')
    )
);

NOTIFY pgrst, 'reload schema';
