-- Close expired public posters by the service date in Korea.
--
-- A poster should remain visible through its application end date. It becomes
-- closed only after that date has passed in Asia/Seoul, regardless of the
-- database server's UTC clock.

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
    AND application_end_at IS NOT NULL
    AND (application_end_at AT TIME ZONE 'Asia/Seoul')::date
      < (now() AT TIME ZONE 'Asia/Seoul')::date;

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_expired_posters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_posters() TO service_role;
