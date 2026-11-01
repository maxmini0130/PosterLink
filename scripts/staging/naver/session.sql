-- Start of every psql session for docs/NAVER_STAGING_VERIFICATION_2026-11-01.md.
-- Stops (quits psql) before any write unless this connection is the expected
-- STAGING project. Run with:
--   psql "<staging DSN>" -v STAGING_REF=<staging ref> -v PROD_REF=<production ref> \
--        -v A=<test account A id> -v B=<test account B id> -v RUN=<short run tag>
--   \i scripts/staging/naver/session.sql
-- Use the direct connection (db.<ref>.supabase.co:5432) or the session pooler
-- (user postgres.<ref>, port 5432), never the transaction pooler (6543).

\set ON_ERROR_STOP on

\if :{?STAGING_REF}
\else
  \echo 'STOP: -v STAGING_REF is missing'
  \quit
\endif
\if :{?PROD_REF}
\else
  \echo 'STOP: -v PROD_REF is missing'
  \quit
\endif
\if :{?A}
\else
  \echo 'STOP: -v A is missing'
  \quit
\endif
\if :{?B}
\else
  \echo 'STOP: -v B is missing'
  \quit
\endif
\if :{?RUN}
\else
  \echo 'STOP: -v RUN is missing'
  \quit
\endif

-- Which project this connection reaches, from the client-side host and user
-- (current_database() is "postgres" in every project and proves nothing).
SELECT :'STAGING_REF' ~ '^[a-z0-9]{20}$' AND :'PROD_REF' ~ '^[a-z0-9]{20}$' AS refs_valid,
       :'STAGING_REF' <> :'PROD_REF' AS refs_differ,
       (:'HOST' = 'db.' || :'STAGING_REF' || '.supabase.co'
        OR :'USER' = 'postgres.' || :'STAGING_REF') AS is_staging,
       (position(:'PROD_REF' IN :'HOST') > 0 OR position(:'PROD_REF' IN :'USER') > 0) AS is_prod,
       :'PORT' <> '6543' AS not_transaction_pooler,
       :'A' ~ '^[0-9a-f-]{36}$' AND :'B' ~ '^[0-9a-f-]{36}$' AND :'A' <> :'B'
         AND :'A' NOT LIKE '00000000-%' AND :'B' NOT LIKE '00000000-%' AS accounts_given,
       :'RUN' ~ '^[a-z0-9-]{3,20}$' AS run_valid
\gset
\if :refs_valid
\else
  \echo 'STOP: STAGING_REF and PROD_REF must be 20-character project refs'
  \quit
\endif
\if :refs_differ
\else
  \echo 'STOP: STAGING_REF equals PROD_REF'
  \quit
\endif
\if :is_prod
  \echo 'STOP: this connection is the PRODUCTION project'
  \quit
\endif
\if :is_staging
\else
  \echo 'STOP: this connection is not the STAGING project (check host/user)'
  \quit
\endif
\if :not_transaction_pooler
\else
  \echo 'STOP: transaction pooler (6543) cannot hold a session; use direct or session pooler'
  \quit
\endif
\if :accounts_given
\else
  \echo 'STOP: A and B must be two real test account ids'
  \quit
\endif
\if :run_valid
\else
  \echo 'STOP: RUN must be 3-20 characters of a-z, 0-9, -'
  \quit
\endif

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
\else
  \echo 'STOP: A and B must exist with confirmed e-mail and no pending change'
  \quit
\endif
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
\unset ON_ERROR_STOP
