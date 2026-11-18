-- 2026-11-19: also close published posters that have no application deadline
-- but whose event already ended (Asia/Seoul calendar day).
--
-- Why: close_expired_posters() (20260828010000) only looks at
-- application_end_at. A notice with no stated deadline (deadline_type
-- unknown/ongoing/until_exhausted, application_end_at NULL) and a finished
-- event stays "published" forever. Public open search already hides these
-- (20261102010000), but they remain published in admin lists, counts and
-- detail pages. On 2026-11-18, 108 published posters matched.
--
-- Rows with an application_end_at keep the existing rule unchanged: a later
-- verified deadline still wins over a past event date.
--
-- Production baseline: pg_get_functiondef read 2026-11-19 equals
-- 20260828010000. Signature, owner and grants are unchanged (CREATE OR
-- REPLACE keeps the ACL). Scheduled by pg_cron job 4 at 00:05 UTC (09:05 KST);
-- this migration does not run the function itself.
--
-- Verify after apply (read-only):
--   SELECT count(*) FROM public.posters
--   WHERE poster_status = 'published'
--     AND application_end_at IS NULL
--     AND event_end_at IS NOT NULL
--     AND (event_end_at AT TIME ZONE 'Asia/Seoul')::date
--       < (now() AT TIME ZONE 'Asia/Seoul')::date;
--   -- expected 0 after the next scheduled run
--
-- Rollback: run the 20260828010000 definition again (CREATE OR REPLACE
-- without the event_end_at branch). Rows already closed can be listed by
-- poster_status = 'closed' AND application_end_at IS NULL AND event_end_at
-- before the apply time, and reopened by id if needed.

CREATE OR REPLACE FUNCTION public.close_expired_posters()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE public.posters
  SET poster_status = 'closed',
      updated_at = now()
  WHERE poster_status = 'published'
    AND (
      (
        application_end_at IS NOT NULL
        AND (application_end_at AT TIME ZONE 'Asia/Seoul')::date
          < (now() AT TIME ZONE 'Asia/Seoul')::date
      )
      OR (
        application_end_at IS NULL
        AND event_end_at IS NOT NULL
        AND (event_end_at AT TIME ZONE 'Asia/Seoul')::date
          < (now() AT TIME ZONE 'Asia/Seoul')::date
      )
    );

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_expired_posters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_posters() TO service_role;
