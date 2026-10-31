-- READ ONLY. Run after an APPROVED migration. No member rows are selected.
-- Compare non-role privileges/policies and function hashes to preflight/backup.
BEGIN READ ONLY;

SELECT c.relrowsecurity AS rls_enabled,
       NOT has_column_privilege('authenticated',c.oid,'role','INSERT') AS member_role_insert_blocked,
       NOT has_column_privilege('authenticated',c.oid,'role','UPDATE') AS member_role_update_blocked,
       NOT has_column_privilege('anon',c.oid,'role','INSERT') AS anon_role_insert_blocked,
       NOT has_column_privilege('anon',c.oid,'role','UPDATE') AS anon_role_update_blocked,
       has_column_privilege('service_role',c.oid,'role','UPDATE') AS service_role_update
FROM pg_class c WHERE c.oid='public.profiles'::regclass;

SELECT t.tgname, t.tgenabled, t.tgtype=21 AS after_row_insert_and_all_updates,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       p.prosecdef AS security_definer, p.proconfig, md5(p.prosrc) AS function_body_md5,
       NOT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_direct_execute_blocked,
       NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_direct_execute_blocked
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.profiles'::regclass AND t.tgname='guard_profile_role_writes';

SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS role_type,
       pg_get_expr(d.adbin,d.adrelid) AS role_default
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.profiles'::regclass AND a.attname='role' AND NOT a.attisdropped;

SELECT a.attname,
       has_column_privilege('authenticated',a.attrelid,a.attnum,'INSERT') AS member_insert,
       has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE') AS member_update,
       has_column_privilege('service_role',a.attrelid,a.attnum,'INSERT') AS service_insert,
       has_column_privilege('service_role',a.attrelid,a.attnum,'UPDATE') AS service_update
FROM pg_attribute a WHERE a.attrelid='public.profiles'::regclass
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;

COMMIT;
