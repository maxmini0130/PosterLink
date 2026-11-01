# 개인정보 고지·운영 읽기 전용 대조 SQL 검토 (2026-11-01)

상태: cc51e12 재검토 통과 — 이전 P2 3건 해결, 추가 차단 결함 없음. P3 표시 문제는 후속 유지. 운영 대조 실행 결과와 병합·배포 승인은 별도다.

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

## b128aeb 재검토

작업 전 origin fetch·status 확인(원격 대비 11커밋 앞섬, 작업 트리 깨끗함). 대상 diff, 새 테스트·공통 PGlite 준비 코드, 방침과 관련 마이그레이션·기존 검토 및 작업 로그를 대조했다.

### 해결된 부분

- 이전 P2-1: 로그와 연결 기록의 기준을 분리했고, 마지막 연결 시각 및 최근 이용 기록 조건과 브라우저 키의 비만료를 설명한다. 실제 파기 구현과 부합한다. 해결.
- 이전 P2-2: 제약 전체 정의·FK 동작, 유일 인덱스 정의/유효성, 함수 본문/언어/보안 모드/search_path 비교가 추가됐다. 앞선 재현 3건과 새 테스트의 변조 사례들이 실패로 검출된다. 단, 아래 소유자 비교는 여전히 빠졌다.
- 이전 P2-3: 마지막 성공 실행의 시각으로 관찰 완료 마지막 주를 계산한다. 최근 주 누락·전체 삭제·성공 실행 없음은 잡는다. 단, 시작 범위는 여전히 실제 저장 결과에 의존하여 아래 첫 주 누락을 놓친다.
- P3의 90일/달력 3개월 차이와 링크 클릭 총계 라벨은 별도 후속으로 남긴 판단을 유지한다. 이번 P2 판정과 분리한다.

### P2-R1. 첫 저장 주를 지우면 기대 시작 주도 같이 뒤로 이동함

위치: scripts/retention/pre-merge-readonly-check.sql:140, 207–209.

missing_weeks 시작을 coalesce(first_stored, start_week)로 정하고 첫 주 검사는 first_stored >= start_week만 요구한다. 따라서 실제로 집계돼야 할 맨 앞 주를 삭제하면 first_stored가 다음 주로 바뀌고 삭제된 주는 검사 범위에서 사라진다. 기존 P2-3에서 요구한 시작 구간 누락 검출이 아직 해결되지 않았다.

로컬 재현: 새 seeded()의 정상 DB에서 min(cohort_week) 한 행만 삭제하고 실제 대조 SQL을 실행했다. 실패 목록은 빈 배열이었다. 이 fixture는 수집 첫 주에 실제 일반 방문이 있어 집계 대상이라는 사실이 확인돼 있으므로 정상적인 수집 전 빈 주를 문제 삼은 사례가 아니다.

수정 방향: 예상 시작점을 현재 남아 있는 min(cohort_week)에서 가져오지 않는다. 최초 집계 대상 일반 방문 주 또는 확인·보존한 최초 기대 주를 독립적으로 사용한다. collection_started_at은 내부 방문도 포함할 수 있으므로 단순 등호가 과도한 경우에는 실제 집계 대상의 시작 근거를 따로 확인·보존하거나 검증 불가로 명시해야 한다. 시작 범위를 검증하지 못했는데 전체 통과로 출력하면 안 된다. 첫 주와 연속된 앞쪽 여러 주를 삭제하는 회귀 사례를 추가한다.

### P2-R2. 함수 소유자가 바뀌어 RPC가 실패해도 전체 통과함

위치: scripts/retention/pre-merge-readonly-check.sql:48–50, 150–157.

이전 검토에서 요청한 함수 소유자 비교가 빠졌다. SECURITY DEFINER 함수는 현재 소유자의 권한으로 동작하므로 본문·search_path·secdef·호출 권한만 같아도 실제 권한이 달라질 수 있다. 새 쿼리는 예전 쿼리에 있던 owner 출력까지 제거해 사람이 결과에서 알아볼 수도 없다.

로컬 재현: 별도 NOLOGIN 역할 no_access_owner를 만들어 record_product_event의 소유자만 그 역할로 바꿨다. 실제 판정 SQL의 모든 항목이 통과했다. 이어 같은 RPC를 호출하면 permission denied for schema auth로 실패했다. 테이블 쓰기와 RLS에 필요한 소유자 권한도 같은 이유로 검사에서 빠질 수 있다.

수정 방향: 정확한 시그니처마다 pg_get_userbyid(proowner)를 actual에 출력하고 적용 주체에 따른 승인된 기대 소유자와 비교한다. 스테이징과 운영에서 이름이 다르다면 기대 소유자를 명시적으로 받되 검증 없이 생략하지 않는다. 보안 정의자 함수 소유자를 권한 없는 역할로 변경하는 음성 검사를 추가한다.

### P2-R3. 예약 명령의 부분 문자열 일치만으로 파기 실행을 보장하지 못함

위치: scripts/retention/pre-merge-readonly-check.sql:146.

j.command LIKE '%public.run_usage_log_retention(50000)%'는 실행할 SQL이 아니라 문자열 리터럴이나 주석 안에 함수 이름이 들어 있어도 true다. 새 판정은 모든 행 true를 요구하므로 잘못된 예약도 통과로 제시한다. 실제 표시된 actual을 사람이 볼 수는 있지만 자동 판정은 거짓 정상이다.

로컬 재현: 정상 seeded DB에서 예약 command만 `SELECT 'public.run_usage_log_retention(50000)'`로 바꿨다. 대조 SQL의 실패 목록은 빈 배열이었다. 이 명령은 문자열을 조회할 뿐 파기를 호출하지 않으며 cron 자체는 성공으로 끝날 수 있다.

수정 방향: 검토된 예약 마이그레이션의 명령과 비교한다. 허용할 차이가 앞뒤 공백뿐이라면 btrim 등으로 한정해서 정확히 비교한다. 문자열·주석 속 함수 이름이나 다른 SQL이 통과하지 않게 하고, 예약 중복과 실행 역할/대상 DB도 실제 적용 기대값으로 확인하면 좋다. 위 문자열 명령을 음성 회귀 사례로 추가한다.

### 검증 및 한계

- Git 제외 data/results/retention-premerge-review/repro-b128.ts에서 새 테스트와 같은 seeded DB 및 실제 판정 SQL을 사용했다. 위 세 경우 모두 전체 통과되는 것을 assert로 확인했고, 소유자 변경 후 실제 RPC 실패도 확인했다. 원본 테스트나 구현은 수정하지 않았다.
- 새 대조 SQL 테스트 3/3 PASS. 정상 DB 및 작성자가 추가한 9가지 변조 검사는 통과하지만 위 세 경우는 포함하지 않는다.
- 공개 방침·새 테스트·공통 준비 코드 Prettier PASS, 검토 기록 Prettier 및 git diff --check 확인. 관련 retention 테스트 31/31 PASS(product-events-migration, retention-metrics-sql, usage-log-retention, pre-merge-readonly-check). 구현을 고치지 않아 전체 웹 build/lint와 루트 전체 테스트는 반복하지 않았다.
- 읽기 전용 트랜잭션과 SELECT 구성은 유지됐다. 운영 DB에 이 SQL을 실행하지 않았으며 실제 pg_cron·서버 버전별 정의 출력은 확인하지 않았다.
- 코드·SQL 변경, push, 배포, 운영/원격 DB 접속·쓰기·마이그레이션 적용 없음. 검토 기록만 로컬 커밋한다. 방침 수정은 해결됐지만 b128aeb 묶음의 대조 SQL은 재검토 통과로 처리하지 않는다.

## cc51e12 재검토

판정: 검토 통과. 이전 P2-R1·R2·R3은 해결됐고 변경 범위에서 추가 차단 결함을 발견하지 않았다. 공개 방침의 보존 기준 수정 통과 판정도 유지한다. 이 판정은 코드·SQL 및 로컬 검증 결과이며 운영 DB의 일치 여부나 첫 파기 성공을 확인한 결과가 아니다.

- P2-R1: 누락 주 생성 범위가 현재 저장된 최소 주가 아닌 collection_started_at의 KST 주부터 시작한다. 첫 저장 주도 그 시작 주와 비교하므로 맨 앞 집계가 지워져도 검사 범위가 줄지 않는다. 첫 주 삭제를 실제 판정 SQL이 실패로 보고하는 것을 확인했다.
- P2-R2: 여섯 함수의 소유자를 actual에 출력하고 기대값 postgres와 비교한다. 기존 재현과 동일하게 record_product_event 소유자를 권한 없는 NOLOGIN 역할로 바꿔 해당 함수 검사가 실패함을 확인했다. 테스트에는 run_usage_log_retention 소유자 변경 사례도 있다.
- P2-R3: 예약 명령 전체를 공백 정규화 후 정확히 비교하고 작업 수 1개와 실행 계정 postgres를 요구한다. 함수 이름만 담은 문자열 조회, 같은 이름의 작업 중복, 실행 계정 anon으로 변경한 경우 모두 실패한다. 정상 명령에 공백·개행만 바꾼 경우는 통과했다.
- BEGIN TRANSACTION READ ONLY부터 ROLLBACK까지 조회만 수행하는 구성은 유지됐다. 새 쓰기 호출이나 파기 실행은 추가되지 않았다.

검증:

- 작업 전 origin fetch·status 확인: 원격 대비 13커밋 앞섬, 작업 트리 깨끗함. AGENTS·CLAUDE·README, 대상 diff와 작업/검토 기록, 예약·집계 마이그레이션을 대조했다.
- 관련 retention 테스트 31/31 PASS(product-events-migration, retention-metrics-sql, usage-log-retention, pre-merge-readonly-check).
- Git 제외 data/results/retention-premerge-review/repro-cc51.ts에서 실제 판정 SQL로 기존 세 재현과 추가 예약 중복·실행 계정 변경의 차단 및 공백만 다른 정상 명령의 통과를 독립적으로 확인했다. 가짜 cron 표를 둔 로컬 PGlite만 사용했다.
- 변경 테스트 Prettier 및 검토 기록 Prettier·git diff --check 확인. 원본 구현 변경이 없어 전체 웹 build/lint·루트 전체 테스트는 반복하지 않았다.

운영 실행 시 남는 확인:

- collection_started_at은 전체 방문의 최소 시각이고 최초 집계 대상은 일반 회원/방문자 중 자동 방문을 제외한 시각이다. 최초 주가 자동·내부 방문뿐이면 시작 주 비교가 보수적으로 실패할 수 있다. SQL 안내대로 방문 근거를 확인해야 하며 단순히 실패 행을 무시하거나 집계 원본을 수정해 통과시키면 안 된다.
- postgres 소유자 기대값과 정의 문자열 표기는 운영 서버에서 확인하지 않았다. 다른 소유자가 나오면 해당 역할의 실제 권한과 승인된 적용 이력을 확인한 뒤 판정한다. 표시 형식 차이도 의미상 동일 여부를 검토한다.
- 실제 job 7 실행 결과, 운영 집계 범위·값·파기 잔량 확인이 여전히 필요하다. P3(90일/달력 3개월 및 링크 클릭 기간 라벨)는 기존 후속 항목으로 유지한다.
- 원본 코드·SQL 변경, push, 배포, 운영/원격 DB 접속·쓰기·마이그레이션 적용 없음. 검토 기록만 같은 브랜치에 로컬 커밋한다.
