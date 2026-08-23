-- Harden low-risk Supabase security advisor warnings.
--
-- This migration keeps public search/recommendation RPCs available where the
-- app calls them directly, but removes direct RPC execution from trigger-only
-- and server-only SECURITY DEFINER functions.

-- Pin search_path on older SECURITY DEFINER functions reported by the advisor.
ALTER FUNCTION public.get_popular_keywords(integer) SET search_path = public;
ALTER FUNCTION public.get_popular_regions() SET search_path = public;
ALTER FUNCTION public.get_recommended_posters(uuid, integer) SET search_path = public;
ALTER FUNCTION public.get_recommended_posters_v2(uuid, integer) SET search_path = public;
ALTER FUNCTION public.log_search(uuid, text, integer) SET search_path = public;
ALTER FUNCTION public.match_posters_by_embedding(public.vector, integer, double precision, uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.notify_poster_owner_on_comment() SET search_path = public;
ALTER FUNCTION public.search_posters_with_synonyms(text, uuid, uuid) SET search_path = public;

-- Trigger-only functions do not need to be callable through PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.enforce_poster_human_structured_verification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invalidate_poster_human_structured_verification_from_relation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invalidate_verified_poster_institution_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_match_on_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_poster_owner_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_poster_source_institution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_verified_poster_institutions() FROM PUBLIC, anon, authenticated;

-- Internal maintenance/source resolution functions are called by trusted
-- database code or service-role code, not directly by browser clients.
REVOKE EXECUTE ON FUNCTION public.close_expired_posters() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_verified_institution(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_poster_source_institution(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_notice_candidate_application_status() FROM PUBLIC, anon, authenticated;

-- Admin traffic overview is only called from the Next.js admin API using the
-- service role after an admin session check.
REVOKE EXECUTE ON FUNCTION public.get_site_visit_overview(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_site_visit_identity_overview(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_site_visit_identity_overview(integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_visit_overview(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_site_visit_identity_overview(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_site_visit_identity_overview(integer, boolean) TO service_role;

-- Semantic embedding search is exposed through /api/posters/semantic-search,
-- where the server owns the OpenAI embedding call and service-role RPC.
REVOKE EXECUTE ON FUNCTION public.match_posters_by_embedding(public.vector, integer, double precision, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_posters_by_embedding(public.vector, integer, double precision, uuid, uuid[]) TO service_role;
