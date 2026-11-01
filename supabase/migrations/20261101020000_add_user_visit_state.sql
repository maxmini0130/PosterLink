-- Retention plan 3-2: a member's "지난 방문" baseline, kept on the server so it
-- is the same on every device. One row per member, written by the member's own
-- browser (at the start of a visit and at most every 5 minutes of activity).
-- Only the three times are stored; no page or poster is recorded here.
--
-- baseline_at is fixed for the whole visit (see apps/web/lib/visitBaseline.ts)
-- and is null on the first visit. Rows go with the account (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS public.user_visit_state (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  visit_started_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL,
  baseline_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_visit_state_order_check
    CHECK (last_active_at >= visit_started_at
      AND (baseline_at IS NULL OR baseline_at <= visit_started_at))
);

ALTER TABLE public.user_visit_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_visit_state_own_select" ON public.user_visit_state;
CREATE POLICY "user_visit_state_own_select" ON public.user_visit_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_visit_state_own_insert" ON public.user_visit_state;
CREATE POLICY "user_visit_state_own_insert" ON public.user_visit_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_visit_state_own_update" ON public.user_visit_state;
CREATE POLICY "user_visit_state_own_update" ON public.user_visit_state
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.user_visit_state FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_visit_state TO authenticated;

COMMENT ON TABLE public.user_visit_state IS
  'Per-member visit times for the home "방문 이후 새 공고" baseline (retention plan 3-2).';

NOTIFY pgrst, 'reload schema';

-- Rollback (manual, after approval; members fall back to this browser's record):
--   DROP TABLE IF EXISTS public.user_visit_state;
