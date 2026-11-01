# 네이버 신원 B 1차 구현 검토 (2026-11-01)

상태: 수정 필요 — P1 1건·P2 2건. 검토 Codex, 구현 Claude. 구현 코드는 수정하지 않는다. 스위치를 켜거나 운영 재개를 승인하는 검토가 아니다.

대상: feat/naver-identity-b-20261101의 afc931a5eb71a900e3ab1ca7b213b13065b1c1cc·e0ac23669085880003d946cdc5324a8fd27f9005·b9eb89e0f8310eefb3bbf51ac895f8bd26f2bb98. 기준: 보안 설계 v4, 그 검토 기록과 WORK_LOG_20261101_naver_identity_b.md. 작업 전 fetch·status·worktree와 AGENTS/CLAUDE/README를 확인했다.

## P1. 연결 해제·다른 계정으로 재연결 뒤에도 이전 계정 로그인 거래가 완료됨

위치: supabase/migrations/20261101030000_add_naver_identity.sql:352-361,466-476; apps/web/app/auth/naver/callback/route.ts:66-80.

naver_tx_callback은 당시 매핑된 계정을 거래의 target_user_id에 저장한다. 이후 naver_tx_complete_login은 그 캐시된 user_id·거래 상태·비밀값·만료만 검사하고, 현재 신원 매핑이 아직 존재하며 같은 회원을 가리키는지 확인하지 않는다. naver_unlink도 진행 중인 로그인 거래를 무효화하지 않는다.

실제 마이그레이션으로 다음 순서를 실행했다: 네이버 X를 A에 연결 → X 로그인 거래의 callback이 A로 해석 → A 연결 해제 성공 → 같은 X를 B에 연결 → 기존 거래를 A로 complete_login. 마지막 함수가 true를 반환했다. 현재 X는 B 소유인데 경로는 이어서 sessionTokenFor(A)와 verifyOtp를 실행한다. A의 이메일·정지 상태가 정상이라면 사용자 ID 2중 검사도 A와 같아서 이 오래된 연결의 사용을 거절하지 못한다. 실제 운영 세션 발급은 하지 않았다.

수정 방향: 로그인 거래를 신원의 안정적인 ID/연결 버전과 결합하고 완료 시 현재 매핑·활성 키·대상 회원이 여전히 일치하는지 적절한 잠금 아래 재검증한다. 해제/교체 시 해당 미완료 거래를 무효화하는 규칙도 같은 DB 경합 순서로 정의한다. 이미 발급된 세션을 유지할지 여부와, 해제 뒤 새 세션을 발급하는 것은 구분한다.

회귀 검사: callback 뒤 해제만 수행한 경우와 B 재연결까지 한 경우 모두 A의 로그인 완료·토큰 발급은 거절. 완료/해제 동시 요청도 실제 다중 DB 연결로 검사한다. 정상으로 계속 연결된 A는 성공해야 한다.

## P2-1. 기본 ACL이 있는 프로젝트에서 서비스 역할의 직접 쓰기와 내부 helper 실행이 남음

위치: 마이그레이션 99-100,509-526행의 REVOKE와 이후 GRANT.

테이블·함수 권한 회수 대상이 PUBLIC·anon·authenticated뿐이라 service_role에 직접 부여된 기존 기본 권한은 사라지지 않는다. '테이블 쓰기 없이 지정 SECURITY DEFINER 함수로만 처리'라는 DB 경계를 보장하지 못한다. 함수의 PUBLIC 실행 권한을 지워도 service_role의 직접 기본 EXECUTE는 별개다.

Supabase 기본 권한을 모형화해 새 테이블/함수에 service_role·anon·authenticated ALL을 미리 부여하고 실제 마이그레이션을 적용했다. service_role의 naver_subjects INSERT와 내부 \_naver_resolve EXECUTE가 true였으며, SET ROLE service_role에서 거래 테이블 직접 INSERT가 성공했다. 익명·일반 회원에게 즉시 공개된다는 뜻은 아니다. 현재 서버 모듈은 실제로 허용 RPC만 부르지만 DB 경계는 설명과 다르다. 현재 운영 프로젝트 ACL은 조회하지 않았다.

수정 방향: 이번에 만드는 테이블·관련 sequence·함수에서 service_role의 기본 권한까지 명시적으로 회수한 뒤, 외부 호출을 허용할 함수만 다시 GRANT한다. SECURITY DEFINER 소유자의 내부 권한은 유지하고 API 역할의 직접 helper 호출을 막는다. 다른 기존 테이블이나 프로젝트 전체 기본 권한을 무단 변경하지 않는다.

회귀 검사: 광범위한 기본 ACL이 있는/없는 두 설정에서 service_role의 테이블 직접 쓰기·내부 helper 실행은 거절되고 지정 RPC는 성공해야 한다. 기존 검사는 기본 ACL을 모델링하지 않는다. [Supabase API 권한](https://supabase.com/docs/guides/api/securing-your-api), [공식 기본 ACL 안내](https://supabase.com/kb/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted).

## P2-2. 공개 로그인 시작 경로에 설계의 요청 횟수 제한이 없음

위치: apps/web/app/auth/naver/start/route.ts:30-66, shared.ts·naverAuthCore.ts 및 middleware. 설계 3장은 시작 요청의 IP별 제한을 요구한다.

같은 출처 확인 외에 호출 예산/속도 제한이 없다. Origin은 일반 HTTP 클라이언트가 보낼 수 있으므로 봇의 반복 요청을 제한하지 못한다. 실제 start 핸들러를 기존 모의 Auth/DB/provider 하네스에 연결해 같은 origin의 요청 40건을 연속 호출했으며 40건 모두 303과 거래 생성 호출로 처리됐다. 실제 DB나 네이버 요청은 하지 않았다. 거래가 30분 동안 쌓이고 공개 callback은 외부 토큰·프로필 요청까지 실행하므로 스위치를 켜기 전에 예산을 마련해야 한다. 운영 WAF가 대신 처리하는지는 미확인이다.

수정 방향: 신뢰할 수 있는 IP/회원/브라우저 단위와 시간창별 제한을 거래 생성 전에 적용하고, callback/오류 경로에도 외부 호출 예산을 정의한다. 서버리스 인스턴스별 메모리 카운터만으로 운영 제한을 보장하지 않는다. 인프라 제한을 사용할 경우 적용 대상·한도·차단 동작·스테이징 증거를 문서에 포함한다.

회귀 검사: 한도 초과 시 거래/외부 인증 호출 0건·제한 응답, 시간창 후 정상 재개, 서로 다른 정상 이용자 영향 분리. 현재 스위치 off는 유지하며 이 검토에서 활성화하지 않는다.

## 통과한 부분과 보완 메모

- 서버/공개 UI 플래그가 분리됐고 기존 /api/auth/naver\*와 옛 토큰 브릿지는 503을 유지한다. 새 HTTP 핸들러 4개는 스위치 off 검사에서 Auth/DB/provider 호출 0으로 503을 반환한다.
- 다만 /auth/naver/link는 route가 아닌 page 함수이고 off에서도 안내 콘텐츠를 렌더한다. 이를 포함해 '모든 네이버 경로가 503'이라는 표현은 정확하지 않다. 이 페이지가 세션을 발급하는 것은 아니므로 별도 차단 결함으로 분류하지 않았다. 응답 정책이나 보고 표현을 맞춘다.
- 브라우저 비밀값·OAuth state 해시·거래 상태 검사, 최종 계정 행 잠금 실패 시 실패 처리, 현재 계정/이메일/정지·최근 인증 재검사와 원자적 연결/복구 방향은 반영됐다. 다른 계정 세션·오래된 인증·교차 출처에 대한 기존 경로 검사도 통과했다.
- sessionTokenFor 실제 모듈을 SDK만 대체해 실행했다. 정상 계정은 토큰을 반환하고 ID 불일치·이메일 없음/미확인·변경 중·정지·삭제의 6가지 계정 상태는 거절했다. 별도 요청 세션 클라이언트에서 verifyOtp 결과의 user와 session.user를 모두 검사하고 실패 쿠키를 응답하지 않는 구조도 확인했다.
- 설정 화면과 연결 확인 화면은 명시적인 POST로 시작/확정/해제를 수행한다. 같은 출처 검사와 거래 쿠키를 결합한 CSRF 방어는 이 1차 범위에서 확인했다. 실제 WebView/네이버 왕복은 검사하지 않았다.
- 테스트에서 키 교체 후 중복 INSERT, 복구·권한·계정 잠금 거절과 대조 성공은 확인된다. 그러나 제공 DB 테스트는 순차 실행이며 '두 계정 동시 연결'을 실제 독립 트랜잭션으로 겹친 결과는 아니다. 활성 키 행 FOR SHARE만으로 신규 키 INSERT까지 직렬화되지는 않으므로 운영 키 변경 SQL의 공통 잠금 규칙과 다중 연결 시험이 필요하다. 설계 검토의 비차단 구현 조건을 유지한다.
- 링크·해제 알림 메일도 이번 범위에서 빠졌다고 구현 로그에 명시돼 있다. 메일 가입뿐 아니라 이 보안 알림까지 재개 전 완성/범위 결정이 필요하다. 메일 공급자가 없다는 이유로 잘못된 연결을 이메일만으로 자동 승인하는 우회는 추가하지 않는다.
- 서버 모듈의 현재 호출은 getUserById/generateLink와 특정 RPC로 제한돼 있고 source guard가 검사한다. 이것은 DB ACL 검사를 대체하지 않는다. 설계 검토 통과는 서비스 역할 예외나 운영 적용 승인과 별개이며 이번 검토는 실제 키를 읽거나 사용하지 않는다.

## 검증 기록

- web lint·production build 통과. 공개 Supabase 설정은 로컬 비접속 대체값으로 실행했다.
- scripts/security 전체를 test-concurrency=1로 실행: 120/123. 실패는 기존 profile-role-release 2건과 withdrawal-only 과거 릴리스 바이트 비교 1건이다.
- 최초 pnpm test는 213/216이었다. 기존 스냅샷 실패 2건 외에 profile-role.test.ts 프로세스가 V8 fatal로 종료돼 해당 파일의 여러 검사가 실행되지 못했다. 이 실행을 300/302로 표현하지 않는다. 동일 파일 목록을 test-concurrency=1로 재실행한 결과 300/302로 기존 스냅샷 실패 2건만 남았다. 신규 DB 9·경로 7·core 6건은 통과했다.
- 독립 재현 자료는 Git 제외 data/results/naver-review/sql-repro.cjs(실제 SQL), start-burst.ts(실제 경로·모의 외부 모듈), admin.cjs(실제 관리자 모듈·모의 SDK)와 검사 로그다. 구현·회귀 테스트 파일을 고치지 않았다.
- 실제 네이버 계정·현재 운영 DB/설정·스테이징 권한·메일·웹뷰 E2E는 미검증이다. 로컬 운영 연결로 로그인/연결/해제를 시험하지 않았다. 새 마이그레이션은 미적용 상태다.

검토 문서와 구현 로그 상태만 같은 브랜치에 로컬 커밋한다. 구현 코드 변경, 실제 서비스 역할 키 사용, push·PR 생성·배포·운영 DB 조회/쓰기·마이그레이션 적용 없음. 문서는 UTF-8·Prettier·git diff --check로 확인한다.
