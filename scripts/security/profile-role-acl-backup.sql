-- READ ONLY. Securely save these GRANT statements BEFORE applying the migration.
-- Contains database role/column permissions, never member profile rows.
-- Emergency rollback must first revoke the corresponding new write grants,
-- then restore this reviewed snapshot. Do not automatically reopen old access.
SELECT format('GRANT %s ON TABLE public.profiles TO %s%s;',
              x.privilege_type,
              CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END,
              CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) AS statement
FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
WHERE c.oid = 'public.profiles'::regclass AND x.privilege_type IN ('INSERT','UPDATE')
  AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role'))
UNION ALL
SELECT format('GRANT %s (%I) ON TABLE public.profiles TO %s%s;',
              x.privilege_type, a.attname,
              CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END,
              CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  AND x.privilege_type IN ('INSERT','UPDATE')
  AND (x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role'));
