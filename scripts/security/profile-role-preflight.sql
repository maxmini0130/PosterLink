-- READ ONLY. No member rows, JWTs, or credentials are selected.
BEGIN READ ONLY;

SELECT current_user, session_user, current_setting('role', true) AS execution_role;

SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c WHERE c.oid = 'public.profiles'::regclass;

SELECT a.attname, n.nspname AS type_schema, t.typname, t.typtype,
       pg_get_expr(d.adbin, d.adrelid) AS role_default,
       (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
        FROM pg_enum e WHERE e.enumtypid = t.oid) AS enum_labels
FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
JOIN pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.profiles'::regclass AND a.attname = 'role' AND NOT a.attisdropped;

SELECT r.role_name,
       has_column_privilege(r.role_name, 'public.profiles', 'role', 'INSERT') AS can_insert_role,
       has_column_privilege(r.role_name, 'public.profiles', 'role', 'UPDATE') AS can_update_role
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name);

SELECT a.attname,
       has_column_privilege('authenticated',a.attrelid,a.attnum,'INSERT') AS member_insert,
       has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE') AS member_update,
       has_column_privilege('service_role',a.attrelid,a.attnum,'INSERT') AS service_insert,
       has_column_privilege('service_role',a.attrelid,a.attnum,'UPDATE') AS service_update
FROM pg_attribute a WHERE a.attrelid='public.profiles'::regclass
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;

SELECT parent.rolname AS granted_role, member.rolname AS member_role, m.admin_option
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
JOIN pg_roles member ON member.oid=m.member
WHERE member.rolname IN ('anon','authenticated','authenticator','service_role')
ORDER BY member.rolname,parent.rolname;

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
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute,
       md5(p.prosrc) AS function_body_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
  AND p.prosrc ILIKE '%profiles%'
ORDER BY p.proname;

-- Auth bootstrap paths also need review; no member rows or function bodies.
SELECT t.tgname, t.tgenabled, n.nspname AS function_schema, p.proname,
       p.prosecdef, p.proconfig, md5(p.prosrc) AS function_body_md5
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE t.tgrelid='auth.users'::regclass AND NOT t.tgisinternal;

COMMIT;
