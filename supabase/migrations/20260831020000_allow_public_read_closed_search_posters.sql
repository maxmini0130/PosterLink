-- Allow public users to read archived public posters returned by search.
-- Listing RPCs still control whether closed posters appear in default discovery.

DROP POLICY IF EXISTS "posters_select" ON public.posters;

CREATE POLICY "posters_select" ON public.posters
  FOR SELECT
  USING (
    (
      poster_status IN ('published', 'closed')
      AND (exposure_tier IS NULL OR exposure_tier IN ('A', 'B'))
    )
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
