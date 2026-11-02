-- Start of every psql session for docs/NAVER_STAGING_VERIFICATION_2026-11-01.md.
-- Checks that this connection is the expected STAGING project (check_target.sql)
-- and only then sets up the run. Run with:
--   psql "<staging DSN>" -v STAGING_REF=<staging ref> -v PROD_REF=<production ref> \
--        -v A=<test account A id> -v B=<test account B id> -v RUN=<short run tag>
--   \i scripts/staging/naver/session.sql
-- Use the direct connection (db.<ref>.supabase.co:5432) or the session pooler
-- (user postgres.<ref>, port 5432), never the transaction pooler (6543).
-- Never \connect elsewhere in this psql: quit and start a new one instead.

\set ON_ERROR_STOP on
\ir check_target.sql

\if :target_ok
  -- Waits in the two-session steps are manual: commit within two minutes.
  SET statement_timeout = '150s';
  SET lock_timeout = '120s';

  SELECT count(*) = 2 AS accounts_ok
    FROM auth.users
   WHERE id IN (:'A'::uuid, :'B'::uuid)
     AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
     AND coalesce(email_change, '') = ''
  \gset
  \if :accounts_ok
    -- Look: these must be your test accounts.
    SELECT id, email FROM auth.users WHERE id IN (:'A'::uuid, :'B'::uuid);

    -- Values of this run. Every transaction of the run uses the state hash :st,
    -- which is how cleanup.sql finds them; secrets and client keys differ per step.
    SELECT encode(sha256(convert_to(:'RUN' || '-state', 'UTF8')), 'hex') AS st,
           encode(sha256(convert_to(:'RUN' || '-naver-x', 'UTF8')), 'hex') AS hx,
           encode(sha256(convert_to(:'RUN' || '-s1', 'UTF8')), 'hex') AS s1,
           encode(sha256(convert_to(:'RUN' || '-s2', 'UTF8')), 'hex') AS s2,
           encode(sha256(convert_to(:'RUN' || '-s3', 'UTF8')), 'hex') AS s3,
           encode(sha256(convert_to(:'RUN' || '-s4', 'UTF8')), 'hex') AS s4,
           encode(sha256(convert_to(:'RUN' || '-s5', 'UTF8')), 'hex') AS s5,
           encode(sha256(convert_to(:'RUN' || '-s6', 'UTF8')), 'hex') AS s6,
           encode(sha256(convert_to(:'RUN' || '-c1', 'UTF8')), 'hex') AS c1,
           encode(sha256(convert_to(:'RUN' || '-c2', 'UTF8')), 'hex') AS c2,
           encode(sha256(convert_to(:'RUN' || '-c3', 'UTF8')), 'hex') AS c3,
           encode(sha256(convert_to(:'RUN' || '-c4', 'UTF8')), 'hex') AS c4,
           encode(sha256(convert_to(:'RUN' || '-c5', 'UTF8')), 'hex') AS c5,
           encode(sha256(convert_to(:'RUN' || '-c6', 'UTF8')), 'hex') AS c6,
           pg_backend_pid() AS backend
    \gset
    \echo 'OK: staging' :STAGING_REF ', run' :RUN ', backend' :backend
  \else
    \echo 'STOP: A and B must exist with confirmed e-mail and no pending change'
  \endif
\endif
\unset ON_ERROR_STOP
