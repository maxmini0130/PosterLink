-- Finish low-risk security advisor hardening after the first pass.

-- Pin search_path on helper functions that are not SECURITY DEFINER but still
-- surfaced by the advisor.
ALTER FUNCTION public.posterlink_url_host(text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.posterlink_url_directory(text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- Deprecated/publicly unused recommendation helpers should not be callable
-- directly by browser roles.
REVOKE EXECUTE ON FUNCTION public.get_popular_regions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_recommended_posters(uuid, integer) FROM PUBLIC, anon, authenticated;

-- The current personalized recommendation RPC is only called after a user
-- session exists, so anonymous execution is unnecessary.
REVOKE EXECUTE ON FUNCTION public.get_recommended_posters_v2(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recommended_posters_v2(uuid, integer) TO authenticated, service_role;

-- Admin point changes are guarded inside the function, but anonymous execution
-- is still unnecessary.
REVOKE EXECUTE ON FUNCTION public.increment_points(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_points(uuid, integer) TO authenticated, service_role;
