-- LOCAL/STAGING VALIDATED ONLY. Production application requires separate approval.
-- Existing row policies and profile data are preserved. First deploy clients that
-- omit role from ordinary profile writes; cached older clients may need a reload.
-- Unapplied migration revised for the observed public.user_role enum. No ALTER
-- TYPE/COLUMN or member-data rewrite is performed. Verify live catalogs first.
BEGIN;
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  role_default text;
  role_type oid;
  role_kind "char";
  enum_labels text[];
  valid_default boolean := false;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'profiles RLS must already be enabled; review existing policies first';
  END IF;
  SELECT a.atttypid, t.typtype, pg_get_expr(d.adbin, d.adrelid)
  INTO role_type, role_kind, role_default
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = 'public.profiles'::regclass AND a.attname = 'role' AND NOT a.attisdropped;

  -- Check the actual type OID and exact constant default, never evaluate a
  -- potentially executable default expression to decide whether it is safe.
  IF role_type IN ('pg_catalog.text'::regtype, 'pg_catalog.varchar'::regtype) THEN
    valid_default := role_default IN ('''user''::text', '''user''::character varying', '''user''');
  ELSIF role_type = to_regtype('public.user_role') AND role_kind = 'e' THEN
    SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel::text COLLATE "C") INTO enum_labels
    FROM pg_enum e WHERE e.enumtypid = role_type;
    IF enum_labels IS DISTINCT FROM ARRAY['admin','operator','super_admin','user']::text[] THEN
      RAISE EXCEPTION 'Unexpected public.user_role labels; review enum before applying';
    END IF;
    valid_default := role_default IN ('''user''::user_role', '''user''::public.user_role');
  ELSE
    RAISE EXCEPTION 'Expected text, varchar or public.user_role enum; review role type before applying';
  END IF;
  IF NOT COALESCE(valid_default, false) THEN
    RAISE EXCEPTION 'Expected the existing constant user role default; review schema before applying';
  END IF;
END;
$$;

-- A second layer prevents role changes even through an existing DEFINER helper.
-- Inspect the actual SET ROLE, not editable metadata/JWT JSON or current_user
-- (which changes to the function owner inside SECURITY DEFINER functions).
CREATE OR REPLACE FUNCTION public.guard_profile_role_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  execution_role text := current_setting('role', true);
  trusted_writer boolean;
BEGIN
  trusted_writer := execution_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (execution_role = 'none' AND session_user IN ('postgres', 'supabase_admin'));

  IF NOT COALESCE(trusted_writer, false) THEN
    IF (TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'user')
      OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Profile role changes require a trusted administrator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_role_writes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_profile_role_writes ON public.profiles;
CREATE TRIGGER guard_profile_role_writes
-- Inspect the final row, including changes made by other BEFORE triggers.
-- UPDATE OF role alone misses a trigger changing NEW.role during nickname edits.
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_writes();

-- Table-level grants override a column REVOKE. Snapshot effective access, remove
-- client table/column write grants, then restore ONLY previously writable columns
-- other than role. No new client column access is introduced. Keep the existing
-- service-role access, including installations which inherited it from PUBLIC.
DO $$
DECLARE
  all_columns text;
  member_insert text;
  member_update text;
  service_insert text;
  service_update text;
BEGIN
  SELECT
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      FILTER (WHERE a.attname <> 'role' AND has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')),
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      FILTER (WHERE a.attname <> 'role' AND has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')),
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      FILTER (WHERE has_column_privilege('service_role', a.attrelid, a.attnum, 'INSERT')),
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
      FILTER (WHERE has_column_privilege('service_role', a.attrelid, a.attnum, 'UPDATE'))
  INTO all_columns, member_insert, member_update, service_insert, service_update
  FROM pg_attribute a
  WHERE a.attrelid = 'public.profiles'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;

  REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.profiles FROM PUBLIC, anon, authenticated', all_columns, all_columns);
  IF member_insert IS NOT NULL THEN
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', member_insert);
  END IF;
  IF member_update IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', member_update);
  END IF;
  IF service_insert IS NOT NULL THEN
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO service_role', service_insert);
  END IF;
  IF service_update IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO service_role', service_update);
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'INSERT')
    OR has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
    OR has_column_privilege('anon', 'public.profiles', 'role', 'INSERT')
    OR has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'Unexpected inherited profile role write privilege; review grants before applying';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
