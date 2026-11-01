-- Removes only this run's data: transactions carrying the run's state hash
-- (:st), and the Naver links and events of the two test accounts A and B.
-- Needs session.sql first (it checks the connection is the staging project).
-- Runs as the session user (postgres), not service_role.

\set ON_ERROR_STOP on
\if :{?st}
\else
  \echo 'STOP: run \\i scripts/staging/naver/session.sql first'
  \quit
\endif
\if :is_staging
\else
  \echo 'STOP: not checked as staging'
  \quit
\endif

BEGIN;
DELETE FROM public.naver_auth_transactions WHERE oauth_state_hash = :'st';
DELETE FROM public.naver_identity_events WHERE user_id IN (:'A'::uuid, :'B'::uuid);
DELETE FROM public.naver_subjects WHERE user_id IN (:'A'::uuid, :'B'::uuid);
COMMIT;
SELECT (SELECT count(*) FROM public.naver_auth_transactions WHERE oauth_state_hash = :'st') AS run_transactions,
       (SELECT count(*) FROM public.naver_subjects WHERE user_id IN (:'A'::uuid, :'B'::uuid)) AS test_links;
\unset ON_ERROR_STOP
