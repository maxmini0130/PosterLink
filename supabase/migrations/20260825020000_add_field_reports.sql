-- AI_VERIFICATION_SPEC.md user feedback loop
-- Collect field-level accuracy reports from users.
--
-- This migration prepares the schema only. Applying it to production still
-- requires explicit operator approval.

CREATE TABLE IF NOT EXISTS public.field_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  report_status TEXT NOT NULL DEFAULT 'received'
    CHECK (report_status IN ('received', 'reviewing', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (poster_id, field_key, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_field_reports_status_created_at
  ON public.field_reports(report_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_reports_poster_field
  ON public.field_reports(poster_id, field_key);

ALTER TABLE public.field_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_reports_insert_authenticated" ON public.field_reports;
CREATE POLICY "field_reports_insert_authenticated"
  ON public.field_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
  );

DROP POLICY IF EXISTS "field_reports_select_own" ON public.field_reports;
CREATE POLICY "field_reports_select_own"
  ON public.field_reports
  FOR SELECT
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "field_reports_admin_all" ON public.field_reports;
CREATE POLICY "field_reports_admin_all"
  ON public.field_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE OR REPLACE VIEW public.field_report_field_overview AS
SELECT
  field_key,
  report_status,
  count(*) AS report_count,
  max(created_at) AS last_reported_at
FROM public.field_reports
GROUP BY field_key, report_status;

COMMENT ON TABLE public.field_reports IS
  'User-submitted field-level accuracy reports for AI verification feedback.';
