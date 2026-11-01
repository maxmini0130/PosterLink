-- Turns on the usage log retention job from 20261031020000_add_usage_log_retention.sql.
-- Apply only after usage_log_retention_preview() has been reviewed and the purge
-- approved: the first runs delete everything older than the retention periods.

create extension if not exists pg_cron;

-- Re-run safe: drop an existing schedule before registering it again.
select cron.unschedule('usage-log-retention-daily')
where exists (
  select 1 from cron.job where jobname = 'usage-log-retention-daily'
);

-- Daily 03:30 KST (= UTC 18:30), away from the 09:00 KST poster jobs.
select cron.schedule(
  'usage-log-retention-daily',
  '30 18 * * *',
  $$ select * from public.run_usage_log_retention(50000); $$
);

-- Rollback: select cron.unschedule('usage-log-retention-daily');
