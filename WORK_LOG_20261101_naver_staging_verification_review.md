# 네이버 스테이징 확인 절차 검토 (2026-11-01)

상태: aa8f2c2 정적 재검토 통과 — 이전 P1 해결, 추가 차단 결함 없음. 실제 psql 및 스테이징 실행은 미검증이며 운영 재개 승인과 구분한다.

작업 전 origin fetch·status 확인. AGENTS·CLAUDE·README·최신 절차와 구현 마이그레이션을 읽었다. 원격 DB에는 접속하거나 명령을 실행하지 않았다. 원본 절차는 수정하지 않고 검토 기록만 같은 브랜치에 커밋한다.

## P1. 프로젝트 식별이 안 되는 조회 뒤 무조건 전체 삭제를 실행하게 됨

위치: 문서 0-1·0-2(34행), 2-4(188행), 4장(247행).

current_database/current_user/now 조회 결과에는 Supabase 프로젝트 ref가 없다. 서로 다른 프로젝트에서도 DB와 역할은 postgres일 수 있으므로 이 출력이 같아도 운영인지 구분할 수 없다. 반면 절차에는 WHERE 없는 거래 전체 삭제와 마지막 신원·이력 전체 삭제가 있다. 잘못된 DSN으로 붙어도 이 '확인'을 통과했다고 오해할 수 있고, 운영이면 네이버 연결·이력이 삭제된다. 또한 첫 준비 단계의 마이그레이션/키 등록보다 0-2 환경 확인이 문서 순서상 뒤에 있다.

수정 방향: 최초 쓰기 전에 기대하는 스테이징 ref/실제 연결 host·user·프로젝트를 확인하는 절차와 일치하지 않으면 실행을 중단하는 guard를 둔다. 직접 연결과 pooler 연결의 프로젝트 식별 위치 차이를 반영하고 비밀번호/전체 DSN은 출력하지 않는다. \conninfo 등을 보조로 활용하되 current_database 하나로 통과시키지 않는다. 전체 삭제 대신 이번 실행의 고유 fixture/run 표식과 A/B 또는 생성한 거래/신원 ID에 한정한 정리를 사용한다. 기대 ref·시험 계정이 기본 placeholder이면 명령을 실행하지 않게 한다. 스테이징 검증 순서는 마이그레이션을 포함한 모든 쓰기보다 앞이어야 한다.

검증 조건: 운영/다른 프로젝트/기대 ref 미설정/시험 계정 미치환 상태는 쓰기 0건으로 중단. 다른 개발자의 스테이징 데이터는 정리 대상에 포함되지 않음. [Supabase 연결 형식](https://supabase.com/docs/guides/database/connecting-to-postgres).

## P2-1. can_lock 메타데이터 판정이 실제 잠금 가능 여부와 일치하지 않음

위치: 1-1(69-76행).

has_table_privilege(owner,'auth.users','UPDATE')만 false라고 B를 중단시키는 것은 잘못된 음성 판정을 낼 수 있다. PostgreSQL의 FOR SHARE는 SELECT와 최소 한 컬럼의 UPDATE 권한으로도 가능하다. 테이블 UPDATE는 false지만 SELECT + UPDATE(id)만 부여한 합성 역할로 마이그레이션과 같은 계정 필드 SELECT ... FOR SHARE가 실제로 성공함을 PGlite에서 확인했다. 반대로 UPDATE=true만으로 필요한 SELECT·스키마·RLS 조건이 모두 충족됐다고 보장할 수도 없다.

수정 방향: metadata는 참고값으로 보고 has_any_column_privilege와 필요한 읽기 권한 등을 구분한다. 최종 진행/중단 판정은 실제 complete_naver_link 함수 소유자의 권한과 테스트 계정 상태에서 대표 잠금/연결이 성공하는지로 결정한다. 현재 false라는 이유로 1-2 실제 대조를 하기 전에 무조건 중단하는 흐름을 수정한다. 함수 소유자 조회도 public schema·정확한 함수 시그니처로 제한한다.

검증 조건: 테이블 UPDATE=false/컬럼 UPDATE=true의 잠금 가능 구성은 잘못 중단하지 않음. 잠금 불가 구성은 실제 연결 0건으로 거절. [PostgreSQL SELECT 권한](https://www.postgresql.org/docs/current/sql-select.html).

## P2-2. 2-4의 역할 상태와 후속 단계가 맞지 않아 그대로 실행되지 않음

위치: 2-4(187-201행), 2-5(208-214행).

2-4 준비는 RESET ROLE로 seed를 쓴 뒤 SET ROLE service_role로 돌아간다. 시험 표에서도 두 세션은 service_role이다. 그런데 마지막 확인 SELECT count와 DELETE는 RESET ROLE 없이 테이블에 직접 접근하므로 이번에 의도적으로 회수한 권한 때문에 모두 42501이 된다. 최신 마이그레이션을 적용한 로컬 PGlite에서 두 문장을 해당 역할로 실행해 모두 거절됨을 확인했다. 정리가 실패하면 600건이 그대로 남아 바로 다음 2-5의 새 거래 생성까지 제한에 걸릴 수 있다.

2-5는 SELECT naver_tx_callback(...) 등 실행할 수 없는 생략 표기와 거래 id 전달/출력 누락이 남아 있다. '터미널에 그대로 복사' 가능한 절차가 아니다. 각 단계 앞뒤의 역할/트랜잭션 상태를 명시하고, 읽기/정리용 RESET ROLE와 시험 API 역할 복귀를 실제 명령으로 넣어야 한다. 신규 거래·V1-only callback도 구체적인 인수로 제공하고 id를 다른 세션에 옮길 수 있게 echo/SELECT 출력을 넣는다. 키 제거 역시 키 표 잠금과 권한, FK 조건을 확인하는 명령을 제공한다.

검증 조건: 순서대로 실행해 권한 오류나 누적 예산 때문에 다음 시험이 잘못 실패하지 않음. 확인 조회와 정리가 정확한 역할에서 실행되고 다음 단계의 시작 상태가 명확함. 정리는 위 P1의 fixture 범위로 제한한다.

## 함께 보완할 실행 조건

- 접속 모드는 직접 연결 또는 session pooler로 고정한다. transaction pooler에 psql을 붙였다고 세션 단위 SET ROLE와 두 터미널의 backend가 계속 유지되는 것은 아니다. pg_backend_pid 등으로 독립된 두 backend인지 확인하고, 필요하면 각 명시적 BEGIN 안에 SET LOCAL ROLE을 사용한다. 현재 문서는 DSN의 모드를 지정하지 않는다. [Supabase 직접/세션/트랜잭션 연결](https://supabase.com/docs/guides/database/connecting-to-postgres).
- psql ON_ERROR_STOP, 오류 후 ROLLBACK/역할 복구 절차, 유한한 statement_timeout/lock_timeout과 예상 대기 시간을 넣는다. 실수한 세션의 열린 트랜잭션을 방치하지 않도록 한다.
- 전체 600건 시험은 시간창 1분이므로 seed부터 검증까지 그 안에 실행돼야 한다. 시간이 지났을 때 재준비하는 조건이나 시간창에 안전한 harness를 명시한다. curl 21건도 직전 앱 로그인·테스트의 같은 주소 예산을 비우거나 새 시간창에서 시작해야 정확히 21번째가 거절된다.
- 2장의 공통 준비는 '각 시험 전'에 A 연결을 만들지만 2-3은 연결 없는 상태를 요구한다. 각 시험별 선행 상태·정리와 완료 여부를 명령으로 고정한다. 2-3은 같은 X가 A/B에 이미 없는지 먼저 확인해야 한다.
- SET ROLE을 할 수 없어 postgres로 시험했다면 API 역할로 실행했다는 판정은 내리지 않는다. 1-3의 has\_\*는 역할 이름을 명시하므로 그 메타데이터 자체는 postgres로 조회해도 유효하지만, 실제 역할의 실행 시험과는 구분한다.

## 검증 기록

- Git 제외 data/results/naver-staging-doc-review/repro.cjs에 로컬 PGlite 검사를 만들었다. 합성 Auth 계정과 최신 실제 마이그레이션을 사용했고, 실제 원격 접속 정보/키는 읽거나 사용하지 않았다.
- can_lock의 false negative와 service_role의 직접 count/DELETE 거절 2건을 실제 SQL로 확인했다. 다중 연결 교착·경합, psql 변수/연결 모드, 실제 네이버 앱·curl은 실행하지 않았다. 현재 컴퓨터에 psql이 없다는 전제에서 이 기록을 전체 절차 실행 결과로 표현하지 않는다.
- 문서 전용 검토이므로 웹 빌드·전체 앱 테스트는 반복하지 않는다. 원본과 검토 문서의 UTF-8·Prettier·줄 끝 공백을 확인한다.
- 구현·기존 테스트·원본 절차 수정, push·PR 생성·배포·운영/원격 DB 조회·쓰기·마이그레이션 적용 없음. 검토 기록만 로컬 커밋한다.

## f742d06 재검토

검토 대상: f742d06. 작업 전 origin fetch와 브랜치 상태를 확인하고 변경 문서, session.sql, cleanup.sql 및 구현 마이그레이션을 대조했다. 원본 절차와 코드는 수정하지 않았다.

### P1. cleanup.sql이 현재 접속 대신 이전 검증 결과를 신뢰함

위치: scripts/staging/naver/cleanup.sql의 `\if :is_staging`부터 DELETE까지.

최초 session.sql은 접속 host/user, 프로젝트 ref, 거래 풀러 포트와 자리표시 계정을 검사한다. 그러나 cleanup.sql은 `st` 존재와 이전에 계산한 `is_staging`만 확인한다. 같은 psql에서 정상 스테이징 검증을 한 뒤 `\connect`로 다른 프로젝트에 재접속하면 사용자 변수는 남고 현재 접속은 바뀐다. 그 뒤 cleanup.sql을 실행하면 이전 true 값으로 현재 DB의 A/B 연결과 이력을 삭제할 수 있다. 특히 동일 계정 UUID를 복제한 환경에서는 정리 대상이 실제로 존재할 수 있다. 실행 직전 접속 불일치를 쓰기 0건으로 차단한다는 기존 P1 조건이 아직 완전히 충족되지 않았다.

수정 방향: 정리의 BEGIN 전에 현재 HOST/USER/PORT와 기대 스테이징 ref 및 운영 ref를 다시 검사하고, 불일치하면 종료한다. 초기 성공 변수만 재사용하지 않으며, 재사용 가능한 공통 접속 검증을 session.sql과 cleanup.sql 양쪽에서 실행하는 방식도 가능하다. 이전 검증값을 초기화하고 현재 접속에 대한 검증을 새로 통과한 경우에만 삭제해야 한다.

검증 조건: 스테이징 검증 후 다른 프로젝트로 재접속하고 정리를 호출해도 DELETE 실행 전 중단되어야 한다. 이 위험 경로를 원격 DB에서 실행하지 않았다. psql의 접속 변수 갱신 및 변수 동작을 기준으로 소스를 분석한 결과이며 실제 psql 재현 결과로 보고하지 않는다. [PostgreSQL psql 문서](https://www.postgresql.org/docs/current/app-psql.html).

### 해결된 지적

- 기존 P2-1: 테이블·컬럼 권한을 참고값으로 낮추고 실제 연결 성공으로 진행 여부를 결정한다. 해결.
- 기존 P2-2: 서비스 역할을 BEGIN/SET LOCAL ROLE/COMMIT으로 제한하고 조회·정리는 postgres로 실행한다. 생략 인자와 세션 간 거래 ID 전달도 구체화했다. 해결.
- 기존 P1의 최초 접속 검사, 마이그레이션 전 검증 순서 및 전체 삭제 제거는 반영됐다. 남은 문제는 위의 접속 변경 후 정리 경로다.

### 검증 범위와 한계

- Git 제외 경로 data/results/naver-staging-doc-rereview/repro.cjs에서 로컬 PGlite로 실제 검사 SELECT와 정리 SQL을 실행했다.
- 새 접속 검사 SQL은 정상 직접 연결·세션 풀러를 허용하고 운영 host, 6543 포트, 자리표시 계정을 거절했다.
- 실제 마이그레이션 위에서 정리 SQL이 해당 run 거래와 시험 계정 A/B만 삭제하고 다른 거래와 계정 C의 연결·이력을 보존했다.
- psql 메타명령, 재접속, 다중 연결 경합, 실제 네이버 인증은 실행하지 못했다. 위 SQL 부분 검증을 전체 절차 통과로 간주하지 않는다.
- 문서 변경 검토이므로 웹 빌드와 전체 테스트는 반복하지 않았다. 검토 기록의 Prettier 및 git diff --check를 수행한다.
- push, 배포, 운영/스테이징 원격 DB 접속·쓰기·마이그레이션 적용 없음. 검토 기록만 같은 브랜치에 로컬 커밋한다.

## aa8f2c2 재검토

판정: 이전 P1 해결. 검토 범위에서 추가로 보고할 차단 결함을 발견하지 않았다. 이 판정은 실행 절차의 소스와 로컬 SQL 부분 검증에 한정하며 실제 스테이징 검증 완료나 운영 재개 승인이 아니다.

- check_target.sql은 진입 시 target_ok를 false로 초기화하고 현재 HOST/USER/PORT를 읽어 모든 조건을 다시 계산한다. cleanup.sql은 이 파일을 상대 경로로 포함하고 target_ok 조건 안에서만 삭제한다. 따라서 이전 접속의 true 값이 그대로 삭제를 허용하던 경로가 제거됐다.
- 검증 실패는 ON_ERROR_STOP 상태의 의도적인 SQL 오류로 중단한다. PostgreSQL 문서는 ON_ERROR_STOP 오류가 현재 실행 중인 상위·하위 스크립트를 중단하고, 대화형 세션이면 프롬프트로 돌아간다고 명시한다. 문서의 target OK 확인 및 실패 시 세션 종료 지침도 대조했다.
- 사용자가 추가로 발견한 quit 동작은 공식 문서와 일치한다. 스크립트 안의 quit은 해당 스크립트만 끝내므로 이전 검토에서 이 중첩 실행 문제를 놓쳤다. 이번 변경은 quit에 의존하지 않고 오류 중단과 쓰기 조건문을 함께 사용한다. [PostgreSQL psql 명령과 ON_ERROR_STOP](https://www.postgresql.org/docs/current/app-psql.html).
- 키 등록·시험 준비·599건 삽입·키 제거의 접속 확인 및 조건문을 확인했다. 두 세션의 수동 단계는 같은 접속을 유지하며 connect를 금지하는 절차를 전제로 한다.

검증:

- origin fetch, 브랜치 상태, 대상 diff, AGENTS·CLAUDE·README 및 기존 검토 기록 확인.
- Git 제외 경로 data/results/naver-staging-doc-rereview/repro-aa8.cjs에서 새 check_target.sql의 실제 두 SELECT를 PGlite로 실행했다. 직접 연결·세션 풀러의 정상 조건은 true, 운영 host·6543 포트·자리표시 계정 조건은 false였다.
- 실제 마이그레이션 위에서 cleanup.sql의 일반 SQL을 실행해 해당 run 거래 및 A/B 연결·이력 삭제와 다른 거래 및 C의 보존을 확인했다. psql 조건문을 실행한 결과로 해석하지 않는다.
- 원본 문서와 검토 기록의 Prettier, git diff --check 확인. 웹 코드 변경이 없어 전체 테스트·빌드는 반복하지 않았다.
- 로컬 psql이 없어 if/gset/ir 및 실제 재접속·중첩 스크립트 오류 전파는 실행 검증하지 못했다. 실제 다중 연결 경합과 네이버 흐름도 미검증이다. 문서의 틀린 ref로 시작하는 음성 검증을 포함해 스테이징에서 확인해야 한다.
- 원본 코드·절차 수정, push, 배포, 원격 DB 접속·쓰기·마이그레이션 적용 없음. 이 검토 기록만 같은 브랜치에 로컬 커밋한다.
