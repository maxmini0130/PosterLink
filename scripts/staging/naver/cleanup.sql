-- Removes only this run's data: transactions carrying the run's state hash
-- (:st), and the Naver links and events of the two test accounts A and B.
-- Needs session.sql first (run values). The current connection is checked
-- again (check_target.sql) immediately before deleting, and the deletes run
-- only inside "\if :target_ok": an earlier result is never trusted.
-- Runs as the session user (postgres), not service_role.

\set ON_ERROR_STOP on
\ir check_target.sql

\if :target_ok
  \if :{?st}
    BEGIN;
    DELETE FROM public.naver_auth_transactions WHERE oauth_state_hash = :'st';
    DELETE FROM public.naver_identity_events WHERE user_id IN (:'A'::uuid, :'B'::uuid);
    DELETE FROM public.naver_subjects WHERE user_id IN (:'A'::uuid, :'B'::uuid);
    COMMIT;
    SELECT (SELECT count(*) FROM public.naver_auth_transactions WHERE oauth_state_hash = :'st') AS run_transactions,
           (SELECT count(*) FROM public.naver_subjects WHERE user_id IN (:'A'::uuid, :'B'::uuid)) AS test_links;
  \else
    \echo 'STOP: run \\i scripts/staging/naver/session.sql first'
  \endif
\endif
\unset ON_ERROR_STOP
