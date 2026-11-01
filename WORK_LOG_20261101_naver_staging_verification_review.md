# 네이버 스테이징 확인 절차 검토 (2026-11-01)

상태: 수정 필요 — P1 1건·P2 2건. 검토 Codex, 작성 Claude. 대상 e9f4622·31fcef58be02c52ec2a8b4b082130bcae529af7c의 docs/NAVER_STAGING_VERIFICATION_2026-11-01.md. 구현 코드 검토 통과(05eb511)는 유지하며, 이 판정은 실행 절차 문서에 대한 것이다.

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
