-- pg_cron 및 http 확장 활성화
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 스케줄 있으면 삭제 후 재등록
select cron.unschedule('check-deadlines-daily')
where exists (
  select 1 from cron.job where jobname = 'check-deadlines-daily'
);

-- 매일 오전 9시 KST (= UTC 00:00) 실행
select cron.schedule(
  'check-deadlines-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://zxndgzsfrgwahwsdbjdj.supabase.co/functions/v1/check-deadlines',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
