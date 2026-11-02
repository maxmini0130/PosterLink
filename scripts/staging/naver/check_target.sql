-- Checks the CURRENT connection and sets :target_ok. Every write block in
-- this procedure runs only inside "\if :target_ok", so a stale result can
-- never be used: the psql variables HOST, USER and PORT are read again here,
-- and a \connect to another database after session.sql is caught.
-- (In a file run with \i, \quit only ends that file, so this check does not
-- rely on it: on failure target_ok stays false and an error stops scripts.)

\set target_ok false
\set ON_ERROR_STOP on

\if :{?STAGING_REF}
\else
  \set STAGING_REF missing
\endif
\if :{?PROD_REF}
\else
  \set PROD_REF missing
\endif
\if :{?A}
\else
  \set A missing
\endif
\if :{?B}
\else
  \set B missing
\endif
\if :{?RUN}
\else
  \set RUN missing
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
-- One value from all conditions, so continuing after a failure cannot set it.
SELECT :'refs_valid'::boolean AND :'refs_differ'::boolean AND :'is_staging'::boolean
       AND NOT :'is_prod'::boolean AND :'not_transaction_pooler'::boolean
       AND :'accounts_given'::boolean AND :'run_valid'::boolean AS target_ok
\gset

\if :target_ok
  \echo 'target OK:' :HOST :USER :PORT
\else
  \echo 'STOP: not the expected STAGING connection (or values missing). Nothing was written.'
  \echo 'refs_valid=' :refs_valid 'refs_differ=' :refs_differ 'is_staging=' :is_staging 'is_prod=' :is_prod 'not_transaction_pooler=' :not_transaction_pooler 'accounts_given=' :accounts_given 'run_valid=' :run_valid
  -- Stops the running script(s) here (ON_ERROR_STOP).
  SELECT 1 / 0 AS stop_not_staging;
\endif
