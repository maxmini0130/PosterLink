# 개인정보 고지·운영 읽기 전용 대조 SQL 검토 (2026-11-01)

상태: 수정 필요 — P2 3건, P3 참고 1건. 대상 2c93d70·82ad5e0, 브랜치 feat/retention-stage0-measurement-20261031. 검토 Codex. 원본 코드·SQL은 수정하지 않았으며 검토 기록만 같은 브랜치에 커밋한다.

## P2-1. 연결 기록을 생성 후 3개월 파기한다고 안내하지만 실제로는 활동에 따라 계속 남음

위치: apps/web/app/privacy/page.tsx:102–108 (2c93d70).

공개 문구는 모든 대상의 기간을 생성 시각부터 계산한다고 선언한 뒤 방문자 식별자와 회원 계정의 연결 기록을 3개월 대상으로 묶는다. 실제 파기 조건은 last_linked_at이 cutoff 이전이고 같은 키의 최근 방문·이벤트가 모두 없을 때다(20261031020000:290–300). link_visitor_identity는 재연결 시 last_linked_at을 갱신하기도 한다. 따라서 생성 후 3개월을 넘긴 연결은 재연결이나 익명 방문만 계속 있어도 남는다. 공개 방침의 고정 3개월 약속과 일치하지 않는다.

로컬 재현: first_linked_at·last_linked_at이 모두 6개월 전인 연결을 만들고 같은 키의 최근 방문 한 건을 넣은 뒤 실제 run_usage_log_retention을 실행했다. 연결 한 건은 그대로 남았다. 최근 활동을 보호하는 기존 구현 자체를 결함으로 판정하는 것은 아니며, 그 동작을 공개 문구에 정확히 반영해야 한다.

수정 방향: 원본 로그와 연결 기록의 기준을 분리하고, 연결의 마지막 연결 시각·최근 활동이 보존에 미치는 조건을 실제 구현대로 설명한다. 정책상 생성 후 고정 3개월을 의도했다면 별도의 구현 변경·검토가 필요하다. 브라우저 localStorage 식별자에는 자동 만료가 없으므로 서버 로그 파기와 기기 식별자 삭제도 혼동하지 않게 한다.

## P2-2. 대조 SQL이 제약 내용·유일 인덱스·함수 실행 설정 차이를 놓침

위치: scripts/retention/pre-merge-readonly-check.sql:44–62, 93–107 (82ad5e0).

6절은 컬럼 이름·형식과 제약 이름만 출력한다. CHECK가 같은 이름으로 CHECK(true)로 바뀌어도 결과가 동일하며, 가입 완료를 계정당 한 번으로 제한하는 product_events_signup_complete_once 유일 인덱스는 아예 조회하지 않는다. 중복 가입 집계와 동시 요청 보호가 없어져도 운영이 검토본과 같다고 오인할 수 있다. 추가된 FK의 ON DELETE 동작도 대조하지 않는다.

3절의 prosrc md5는 본문 비교 방법으로 타당하고 실제 여섯 해시가 모두 일치했다. 다만 함수 전체 정의 비교는 아니다. search_path는 proconfig에 있고 본문 해시에 들어가지 않으며 현재 결과에는 출력도 하지 않는다. 보안 정의자 함수의 search_path를 RESET해도 body_matches가 true다. SECURITY DEFINER·owner는 출력되지만 함수별 기대값은 명시하지 않는다.

로컬 재현: 유일 인덱스를 DROP하고 product_events_client_check를 같은 이름의 CHECK(true)로 바꾼 뒤 6절 결과가 변경 전과 완전히 같음을 확인했다. record_product_event의 search_path를 RESET한 뒤 본문 해시도 여전히 true이며 proconfig만 NULL이 됐다.

수정 방향: pg_get_constraintdef와 대상 테이블/schema, FK 삭제 동작, pg_get_indexdef 및 indisunique/indisvalid/조건부 인덱스 조건을 검토본과 비교한다. 함수는 정확한 시그니처별 proconfig·언어·보안 모드·소유자 기대값을 함께 대조한다. 해시는 출처 본문 동일성 확인용으로 유지할 수 있지만 단독으로 전체 함수 동일성을 보장하지 않는다. [PostgreSQL pg_proc 항목](https://www.postgresql.org/docs/16/catalog-pg-proc.html).

## P2-3. 집계 누락 검사가 저장된 최소·최대 주 사이만 검사함

위치: scripts/retention/pre-merge-readonly-check.sql:28–40 (82ad5e0).

generate_series의 양 끝이 저장된 집계의 min/max다. 따라서 마지막 저장 주 이후 관찰이 끝난 주가 빠졌거나, 수집 시작 주가 누락돼도 missing_week가 나오지 않는다. 집계가 비어 있으면 양 끝이 NULL이어서 역시 0행이다(로컬 실제 쿼리로 확인). min/max/count를 사람이 볼 수는 있지만 기대하는 마지막 주가 제시되지 않아 오래된 연속 집계만 있어도 누락 없음으로 오인할 수 있다. 이는 파기 전에 모든 관찰 완료 주를 저장했는지 확인하려는 병합 전 절차의 핵심 조건이다.

수정 방향: usage_log_retention_state.collection_started_at 및 최초 집계 대상 방문 조건에서 기대 시작 주를 정하고, 구현과 동일한 KST 주 시작·주 종료 후 30일 관찰 완료 조건으로 기대 마지막 주를 계산한다. 저장된 max가 아니라 기대 범위에서 anti-join하여 누락을 찾는다. 시작 시각과 원본 방문이 모두 없는 최초 상태는 명시적으로 판정하고, 이미 수집·파기가 진행된 상태에서 집계 0건은 실패로 구분한다. job 성공은 그 대조를 대신하지 않는다.

## P3 참고. 90일 선택은 달력 3개월과 정확히 같지 않음

위치: apps/web/app/admin/traffic/page.tsx:122, apps/web/lib/trafficAnalytics.ts:4.

365일 선택 제거는 반영됐다. 다만 보존은 KST 달력 3개월이고 조회는 오늘 0시부터 89일 전으로 계산하므로, 짧은 월이 포함된 시점에는 90일 범위 시작이 보존 cutoff보다 앞설 수 있다. 예를 들어 2027-05-01 12:00 KST에서 보존 cutoff는 2027-02-01 12:00, 90일 화면의 시작은 2027-02-01 00:00이다. 보존 초과 원본을 새로 보관하는 문제는 아니지만 화면의 기간 일부는 데이터가 없다. 달력 3개월 선택 또는 cutoff 기준 범위 제한·가용 기간 안내가 정확하다. API는 여전히 365까지 허용하므로 화면 선택지 제한과 API 제한은 구분해야 한다.

대시보드 링크 클릭은 기간 WHERE 없이 남아 있는 전체 행을 센다. 정상 일일 파기 직후에는 대체로 최근 3개월이지만, 일일 실행 사이 시간과 배치 잔량이 있으면 엄밀한 최근 3개월 합계가 아니다. 정확한 기간 라벨을 유지하려면 조회에도 같은 cutoff를 적용하는 편이 맞다.

## 확인된 사항과 검증 범위

- 작업 전 fetch·status 확인: origin 대비 9커밋 앞섬, 작업 트리 깨끗함. AGENTS·CLAUDE·README, 관련 작업 로그·runbook, 세 마이그레이션 및 수집·식별자 코드 대조.
- 공개 방침의 무작위 방문 키·세션 키, 로그인 계정 연결, 웹/앱 저장소 분리 설명은 관련 구현과 부합한다. 계정 삭제 시 FK의 CASCADE/SET NULL 방향도 설명과 부합한다. 전체 개인정보법 준수 여부를 법률적으로 인증한 검토는 아니다.
- 대조 SQL은 BEGIN TRANSACTION READ ONLY부터 ROLLBACK까지 SELECT만 수행한다. 직접 호출하는 preview 및 그 cutoff 함수도 현재 검토본에서는 조회만 한다. 파기·집계·예약 변경 함수를 호출하지 않으며 지속성 테이블에 쓰는 문장이 없다. PostgreSQL READ ONLY는 지속성 테이블의 DML/DDL을 차단한다. [공식 트랜잭션 문서](https://www.postgresql.org/docs/current/sql-set-transaction.html).
- job 이름·스케줄·명령의 기대값은 예약 마이그레이션과 부합한다. 11/01 03:30 KST 실행은 10/31 18:30 UTC다. 실제 job 7 및 실행 결과는 원격에서 확인하지 않았다. UTC 날짜 경계를 혼동하지 않아야 한다.
- 함수 여섯 개 prosrc에서 CR을 제거한 md5가 SQL 상수와 모두 일치함을 PGlite에서 확인했다. 일상적 배포 동일성 비교 용도로 타당하며 서명·설정·권한 확인은 별도다.
- 미리보기는 실행 이후 새로 만료된 행이 생길 수 있어 반드시 0이라고 단정할 수 없다. 집계 snapshot 항목의 rows는 항상 NULL이다. 쿼리 주석의 near zero는 이 점과 배치 한도를 고려해 해석한다.
- 로컬 격리 재현: Git 제외 data/results/retention-premerge-review/repro.ts. 실제 마이그레이션으로 구성한 PGlite에 cron 조회용 가짜 표를 두고 SQL 전체를 실행했다. 실제 pg_cron 확장·운영 데이터는 사용하지 않았다.
- 기존 관련 테스트 28/28 PASS: product-events-migration, retention-metrics-sql, usage-log-retention. 공개 privacy 페이지 Prettier PASS. 검토 기록 Prettier 및 git diff --check 확인. 구현 변경이 없어 웹 build/lint·전체 테스트는 반복하지 않았다.
- 운영 DB 접속·SQL 실행·쓰기·배포·push 없음. 코드와 대조 SQL은 그대로 두고 이 기록만 로컬 커밋한다. 두 커밋 묶음은 현 상태로 검토 통과 처리하지 않는다.
