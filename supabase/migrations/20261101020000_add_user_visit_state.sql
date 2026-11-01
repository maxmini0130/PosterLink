-- Retention plan 3-2: a member's "지난 방문" baseline, kept on the server so it
-- is the same on every device. One row per member, written by the member's own
-- browser (at the start of a visit and at most every 5 minutes of activity).
-- Only the three times are stored; no page or poster is recorded here.
--
-- baseline_at is fixed for the whole visit (see apps/web/lib/visitBaseline.ts)
-- and is null on the first visit. Rows go with the account (ON DELETE CASCADE).
--
-- Writes go only through record_user_visit, which keeps the record with the
-- later last activity in one statement: a delayed request from another device
-- cannot move the stored visit back. The three times are replaced together so
-- the stored visit always comes from one device's view.

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

-- Reads only; writes go through record_user_visit below.
REVOKE ALL ON public.user_visit_state FROM anon, authenticated;
GRANT SELECT ON public.user_visit_state TO authenticated;

CREATE OR REPLACE FUNCTION public.record_user_visit(
  p_visit_started_at TIMESTAMPTZ,
  p_last_active_at TIMESTAMPTZ,
  p_baseline_at TIMESTAMPTZ
)
RETURNS TABLE (
  visit_started_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  baseline_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  -- A device clock far ahead would otherwise win every later comparison.
  IF p_last_active_at <= now() + interval '5 minutes' THEN
    INSERT INTO public.user_visit_state AS s
      (user_id, visit_started_at, last_active_at, baseline_at, updated_at)
    VALUES (v_user, p_visit_started_at, p_last_active_at, p_baseline_at, now())
    ON CONFLICT (user_id) DO UPDATE
      SET visit_started_at = EXCLUDED.visit_started_at,
          last_active_at = EXCLUDED.last_active_at,
          baseline_at = EXCLUDED.baseline_at,
          updated_at = now()
      WHERE s.last_active_at < EXCLUDED.last_active_at;
  END IF;

  -- The stored record, whichever device it came from.
  RETURN QUERY
    SELECT s.visit_started_at, s.last_active_at, s.baseline_at
    FROM public.user_visit_state s
    WHERE s.user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_visit(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_visit(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

COMMENT ON TABLE public.user_visit_state IS
  'Per-member visit times for the home "방문 이후 새 공고" baseline (retention plan 3-2).';

NOTIFY pgrst, 'reload schema';

-- Rollback (manual, after approval; members fall back to this browser's record):
--   DROP FUNCTION IF EXISTS public.record_user_visit(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ);
--   DROP TABLE IF EXISTS public.user_visit_state;
