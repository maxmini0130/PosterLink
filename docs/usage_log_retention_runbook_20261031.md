# 이용 기록 보관 기간 파기 배치 운영 절차 (2026-10-31)

기간은 방침 초안(`apps/web/app/privacy/policy.ts`)을 따른다. 2026-10-31 사용자 결정.

| 대상                                                                              | 처리                                           | 기준                         |
| --------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| `site_visit_logs`, `poster_view_logs`, `poster_link_click_logs`, `product_events` | 삭제                                           | 생성 시각부터 KST 달력 3개월 |
| `site_visit_logs.query_string`, `referrer_url`                                    | `NULL`로 비움(행과 `referrer_host`는 유지)     | 30일                         |
| `search_logs`                                                                     | 삭제                                           | 30일                         |
| `visitor_identity_links`                                                          | 삭제(그 키의 방문·이벤트가 3개월 안에 없을 때) | 마지막 연결 시각 3개월       |
| `usage_weekly_cohorts`(신규)                                                      | 보관. 식별자 없는 주별 집계                    | 기간 없음                    |

감사 기록(90일)은 법정 보존 대상과 섞여 있어 이번 범위에서 제외한다. 방침 초안도 "구분 전 일괄 삭제하지 않는다"고 적고 있다.

## 동작

- `run_usage_log_retention(p_batch)`: 한 트랜잭션에서 ① 끝난 주의 집계를 저장하고 ② 단계마다 최대 `p_batch`행을 정리한다. 집계가 실패하면 아무것도 지우지 않는다. 쌓인 양이 많으면 매일 나눠서 줄어든다.
- 집계는 코호트 주가 시작되고 37일 뒤(마지막 사람의 30일 관찰이 끝난 뒤)에 한 번 저장되고 다시 바뀌지 않는다. "신규"는 45일 동안 방문이 없다가 방문한 사람이다. 첫 실행은 원본 첫 방문 주부터, 이후에는 마지막 저장 주의 다음 주부터 이어서 저장한다. 원본이 모두 만료돼도 주는 끊기지 않고, 신규가 없거나 방문이 없는 주도 0으로 남긴다(행이 없으면 "아직 계산 안 됨"이다). `usage_log_retention_state`에 실제 첫 방문 시각(주가 아닌 정확한 시각)과 실행마다 적용한 원본 cutoff를 남긴다. 직전 45일이 첫 방문 이전이나 그 cutoff 이전으로 넘어가는 주는 `lookback_complete = false`로 표시한다.
- 모든 함수는 `anon`·`authenticated`·`service_role`의 실행 권한을 회수했다. API로 호출할 수 없고 DB 소유자와 `pg_cron`만 실행한다. 집계 테이블은 `service_role` 조회만 허용한다.

## 운영 반영 순서 (모두 사용자 실행, Supabase SQL Editor)

1. 0단계 마이그레이션(`20261031010000_extend_product_events_for_retention.sql`)을 먼저 적용한다. 파기 함수가 `visitor_identity_links`와 `product_events.visitor_key`를 쓴다.
2. 함수 마이그레이션 `20261031020000_add_usage_log_retention.sql`을 `BEGIN; … COMMIT;`으로 감싸 실행한다. **이 단계에서는 아무것도 삭제되지 않는다.**
3. 삭제 예정 건수를 확인한다(읽기 전용).

   ```sql
   SELECT * FROM usage_log_retention_cutoffs();
   SELECT * FROM usage_log_retention_preview();
   SELECT date_trunc('month', created_at AT TIME ZONE 'Asia/Seoul')::date AS month, count(*)
   FROM site_visit_logs GROUP BY 1 ORDER BY 1;
   ```

   첫 실행은 수집 시작(2026-07-18)부터 cutoff 이전 기록 전부가 대상이다. 필요하면 이 시점에 기존 기록을 내보내 보관할지 결정한다(내보낸 파일도 같은 보관 기간 대상이다).

4. 건수를 승인하면 예약 마이그레이션 `20261031030000_schedule_usage_log_retention.sql`을 실행한다. 매일 03:30 KST에 `run_usage_log_retention(50000)`이 돈다.
   - SQL Editor에서는 `BEGIN`/`COMMIT`으로 감싸지 않는다. 2026-11-01 감싼 실행에서 job id(6)만 반환되고 등록은 롤백됐다. 단일 `cron.schedule(...)` 문장으로 실행하고, 반환된 job id가 아니라 `SELECT jobid, jobname, schedule, username, active FROM cron.job WHERE jobname = 'usage-log-retention-daily';`로 등록을 확인한다.
5. 다음 날 실행 결과를 확인한다.

   ```sql
   SELECT status, return_message, start_time, end_time
   FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'usage-log-retention-daily')
   ORDER BY start_time DESC LIMIT 3;
   SELECT * FROM usage_log_retention_preview();   -- 0이 될 때까지 줄어야 한다
   SELECT * FROM usage_weekly_cohorts ORDER BY cohort_week;
   ```

6. 첫 실행이 성공한 뒤에만 개인정보처리방침에 "자동 파기" 문구를 게시한다([retention_metrics_20261031.md](retention_metrics_20261031.md) 0-6). 그 전까지는 "자동 정리를 운영하지 않는다" 문구를 유지한다.

## 롤백

- 예약 중지: `select cron.unschedule('usage-log-retention-daily');`
- 함수·집계 제거: 함수 마이그레이션 끝의 Rollback 주석.
- **삭제된 행은 복구할 수 없다.** 백업 복원 외 방법이 없으므로 3단계 확인이 유일한 안전장치다.

## 알려진 영향

- 운영자 성과 리포트(`/api/operator/performance-report`)와 관리자 트래픽(`/api/admin/traffic`)은 최대 365일을 고를 수 있지만, 활성화 후에는 약 3개월 이전 데이터가 없다. 화면의 기간 선택을 90일 이하로 줄이는 후속 수정이 필요하다.
- 관리자 대시보드의 "링크 클릭" 총계는 최근 3개월 합계가 된다.
- 추천(`poster_view_logs` 최근 조회 50건)은 최근 3개월 조회만 반영한다.
- 관리자 트래픽의 유입 URL 상세는 30일이 지나면 `referrer_host`만 남는다.
- 인기 검색어(`get_popular_keywords`)는 원래 30일 기준이라 영향이 없다.
