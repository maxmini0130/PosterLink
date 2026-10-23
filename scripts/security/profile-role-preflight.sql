-- READ ONLY. No member rows, JWTs, or credentials are selected.
BEGIN READ ONLY;

SELECT current_user, session_user, current_setting('role', true) AS execution_role;

SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c WHERE c.oid = 'public.profiles'::regclass;

SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role';

SELECT r.role_name,
       has_column_privilege(r.role_name, 'public.profiles', 'role', 'INSERT') AS can_insert_role,
       has_column_privilege(r.role_name, 'public.profiles', 'role', 'UPDATE') AS can_update_role
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name);

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS trigger_definition,
       p.proname, p.prosecdef, p.proconfig, p.proacl,
       md5(p.prosrc) AS function_body_md5
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal;

-- List relevant DEFINER helpers without dumping bodies which may contain secrets.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
  AND p.prosrc ILIKE '%profiles%'
ORDER BY p.proname;

COMMIT;
