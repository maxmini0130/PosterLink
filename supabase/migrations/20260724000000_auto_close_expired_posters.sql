-- 마감일이 지난 published 포스터를 매일 자동으로 closed 처리한다.
--
-- 배경: 기존 check-deadlines 엣지 함수는 "내일 마감" 알림만 보내고 상태를
-- 바꾸지 않아, 마감이 지난 포스터가 계속 published 로 노출되었다.
--
-- 규칙: application_end_at 이 "오늘 0시(UTC)" 이전인 published 포스터만 닫는다.
--       (마감 당일까지는 노출 유지, application_end_at 이 NULL 인 상시/이용안내는 제외)

create extension if not exists pg_cron;

-- 만료 포스터를 닫는 로직을 함수로 캡슐화(크론과 백로그 정리에서 공유)
create or replace function public.close_expired_posters()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
begin
  update public.posters
  set poster_status = 'closed',
      updated_at = now()
  where poster_status = 'published'
    and application_end_at is not null
    and application_end_at < date_trunc('day', now());

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

-- 재실행 안전: 기존 스케줄이 있으면 제거 후 재등록
select cron.unschedule('close-expired-posters-daily')
where exists (
  select 1 from cron.job where jobname = 'close-expired-posters-daily'
);

-- 매일 오전 9시 5분 KST (= UTC 00:05) 실행. 마감 알림(UTC 00:00)과 겹치지 않게 5분 뒤.
select cron.schedule(
  'close-expired-posters-daily',
  '5 0 * * *',
  $$ select public.close_expired_posters(); $$
);

-- 배포 시점의 기존 만료 백로그도 즉시 정리
select public.close_expired_posters();
