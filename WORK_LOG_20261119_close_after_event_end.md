# 2026-11-19 행사 종료 공고 자동 마감

## 문제

서울시 청년 전세사기 피해예방 현장설명회(03b68a52)는 원문에 신청 마감일이 없다. 그래서 마감을 미확인(unknown, `application_end_at` NULL)으로 두었고, 12/1 21:00 행사가 끝난 뒤 마감 처리가 필요했다.

조사해 보니 이 공고만의 문제가 아니었다.

- 매일 09:05 KST에 실행되는 `close_expired_posters()`(pg_cron job 4)는 `application_end_at`이 있는 공고만 닫는다.
- 그래서 신청 마감일 없이 행사일만 있는 공고는 행사가 끝나도 계속 published로 남는다.
- 11/18 기준 운영에서 이런 공고가 108건이었다(fixed 26, unknown 30, until_exhausted 52, ongoing 0).
- 이 공고들은 공개 '모집 중' 검색(20261102010000)에서는 이미 빠지지만, 관리자 목록·건수·상세 화면에는 공개로 남는다.

## 변경

- `supabase/migrations/20261119010000_close_posters_after_event_end.sql`
  - `close_expired_posters()`에 조건을 추가했다. `application_end_at IS NULL`이고 `event_end_at`의 서울 날짜가 오늘 이전이면 마감한다.
  - 마감일이 있는 공고의 기존 규칙은 그대로다.
  - 시그니처·권한도 그대로다.
  - 마이그레이션 안에서 함수를 실행하지 않는다. 적용 후 다음 예약 실행(09:05 KST)에 닫힌다.

## 검증

- 운영 `pg_get_functiondef`가 20260828010000과 같은 것을 확인했다(읽기 전용).
- 새 조건과 같은 WHERE로 운영을 읽기 전용 조회했다.
  - 신규 조건 108건, 기존 조건 오늘 0건, ongoing 0건
- 마이그레이션은 아직 운영에 적용하지 않았다(사용자 승인 필요).

## 적용 후 확인

마이그레이션 파일 주석의 검증 쿼리를 실행한다. 다음 예약 실행 뒤 0건이어야 한다.

- 03b68a52는 12/2 09:05 실행에서 closed가 되어야 한다.

## 롤백

20260828010000의 함수 정의를 다시 실행한다. 이미 닫힌 행은 `poster_status = 'closed' AND application_end_at IS NULL`이고 적용 시각 이전 `event_end_at`인 행으로 찾아 id별로 되돌린다.
