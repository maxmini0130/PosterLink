-- ============================================================
-- PosterLink relation edit policies
-- Allows poster owners and admins to update M:N relation rows
-- used by the operator poster edit screen.
-- ============================================================

DROP POLICY IF EXISTS "poster_categories_delete" ON poster_categories;
CREATE POLICY "poster_categories_delete" ON poster_categories FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM posters p
        WHERE p.id = poster_categories.poster_id
          AND (
              p.created_by = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM profiles
                  WHERE id = auth.uid()
                    AND role IN ('admin','super_admin')
              )
          )
    )
);

DROP POLICY IF EXISTS "poster_regions_delete" ON poster_regions;
CREATE POLICY "poster_regions_delete" ON poster_regions FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM posters p
        WHERE p.id = poster_regions.poster_id
          AND (
              p.created_by = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM profiles
                  WHERE id = auth.uid()
                    AND role IN ('admin','super_admin')
              )
          )
    )
);

DROP POLICY IF EXISTS "poster_links_update" ON poster_links;
CREATE POLICY "poster_links_update" ON poster_links FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM posters p
        WHERE p.id = poster_links.poster_id
          AND (
              p.created_by = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM profiles
                  WHERE id = auth.uid()
                    AND role IN ('admin','super_admin')
              )
          )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM posters p
        WHERE p.id = poster_links.poster_id
          AND (
              p.created_by = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM profiles
                  WHERE id = auth.uid()
                    AND role IN ('admin','super_admin')
              )
          )
    )
);

DROP POLICY IF EXISTS "poster_links_delete" ON poster_links;
CREATE POLICY "poster_links_delete" ON poster_links FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM posters p
        WHERE p.id = poster_links.poster_id
          AND (
              p.created_by = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM profiles
                  WHERE id = auth.uid()
                    AND role IN ('admin','super_admin')
              )
          )
    )
);

-- Ask PostgREST to reload schema metadata after relation/policy changes.
NOTIFY pgrst, 'reload schema';
