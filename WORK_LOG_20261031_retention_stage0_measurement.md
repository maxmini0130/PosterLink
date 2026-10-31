# 재방문·가입 전환 0단계 측정

상태: 재검토 대기 (구현 Claude, 검토 Codex) — 고정 검사 허용 목록 전환 커밋 재검토 요청. 운영 반영(마이그레이션·병합)은 사용자 승인 필요

사용자가 `docs/RETENTION_PLAN_2026-10-31.md` 0단계부터 진행을 요청했다. 시작 전 `.claude/settings.local.json`에 git push, vercel --prod, supabase db push, psql·`--apply` 등 운영 쓰기 명령 deny 규칙을 추가했다.

- 문제: 기존 측정은 자체 로그 5종(`site_visit_logs`, `poster_view_logs`, `poster_link_click_logs`, `search_logs`, `product_events`), Vercel Analytics, GA4(코드 배포·수집 OFF)로 나뉘어 있었다. 가입 시작 화면·기능, 공유, 관심 조건 저장, 공고 조회 출처, 익명→계정 연결이 없었고 익명 키가 2개로 갈라져 있었다. 현황은 [0-1 보고서](docs/retention_stage0_measurement_audit_20261031.md).
- 결정: 사용자 선택에 따라 운영 웹 소스 `release/ga4-production-20261025`(`2c6744a`)에서 `feat/retention-stage0-measurement-20261031` worktree를 만들고, 부족 이벤트는 기존 `product_events`를 확장해 기록한다. 쓰기는 `auth.uid()`로 user_id를 정하는 SECURITY DEFINER RPC 2개로만 하며 새 사용자 요청 경로에 서비스 역할 키를 추가하지 않았다. GA4·Vercel에는 이벤트를 추가하지 않았다.
- 변경: 마이그레이션 `20261031010000_extend_product_events_for_retention.sql`(**작성만, 미적용**), `lib/productEventsCore.ts`·`productEvents.ts`·`visitorIdentity.ts`, 레이아웃 `ProductEventsTracker`, 상세 찜·공유·조회 출처, 기관 팔로우, 로그인·가입·알림 CTA, 온보딩·마이페이지 관심 조건, 카드 출처 속성. 공유 링크는 쿼리를 지우고 `utm_campaign=pl_share`만 붙이며, 공유 시트 닫기 시 발생하던 미처리 예외를 처리했다.
- 문서: [지표 정의·조회 SQL·개인정보 문안 제안](docs/retention_metrics_20261031.md), [변경 적용일 기록](docs/release-markers.md).
- 검증: `pnpm --filter web lint` PASS, `tsc --noEmit` PASS, `pnpm --filter web build` PASS(Node 24.15.0), `pnpm test` 186/188 — 실패 2건(`scripts/security/profile-role-release.test.ts`)은 변경 전 `2c6744a`에서도 동일하게 실패하는 GA4 이전 보안 릴리스 스냅샷 비교로 이번 변경과 무관. 신규 단위 9건, PGlite 마이그레이션 7건(Supabase 기본 권한 재현, 클라이언트 직접 접근 거부, user_id 위조 불가, 신규 가입 1회·기존 회원 비가입 처리, 웹/앱 별도 연결) PASS. 지표 쿼리 Q1~Q5·검증 쿼리를 PGlite 고정 데이터로 실행해 손계산과 일치 확인. Prettier·`git diff --check` PASS.
- 미검증: 로컬 `.env.local`이 운영 Supabase를 가리켜 브라우저 실행 시 운영 방문·조회 로그가 쓰이므로 Playwright UI 확인과 테스트 계정 연결 시연은 하지 않았다. 스테이징 준비 후 수행한다. Node 20 빌드는 실행하지 않았다.
- 운영 영향: 운영 DB 쓰기·마이그레이션·배포·push 없음. 웹만 먼저 배포되면 새 RPC 호출은 조용히 실패하고(오류 시 10분 백오프) 조회 기록은 `source` 없이 계속 저장된다.
- 남은 작업: 마이그레이션 적용 승인과 적용 시각 기록, 스테이징에서 계정 연결 시연·Playwright, 개인정보처리방침 문안과 로그 보존 기간 결정, 비회원 찜 안내(2단계)에서 `signup_start` 흐름 보강. 로그인 페이지가 `redirectTo`를 무시하는 문제를 발견했으며 2-3에서 처리한다.
- 롤백: 웹은 이번 커밋 revert. DB는 마이그레이션 하단 주석의 역순 절차를 따르되, 추가된 이벤트 행은 내보낸 뒤 삭제한다.

## Codex 검토 결함 수정

[Codex 검토 기록](WORK_LOG_20261031_retention_stage0_review.md)의 3건을 확인·재현한 뒤 고쳤다. 검토 기록은 협업 규칙에 따라 이 브랜치에 함께 커밋한다.

1. **가입 연결 `pending` 재시도 없음** — 이메일 가입은 auth 이벤트가 프로필 upsert보다 먼저 와서 `pending`을 받고, 이어지는 SPA 이동에서는 재시도가 없었다(OAuth는 callback이 프로필을 먼저 만들어 영향 없음). 재시도 규칙을 Supabase 의존 없는 `lib/identityLinker.ts`로 분리했다: `pending`은 2·5·15·30·60초 최대 5회 재시도, RPC 오류는 10분 백오프, 로그아웃·계정 전환 시 예약 취소, 전환 전 계정의 늦은 응답 무시. 가입 페이지의 프로필 생성 직후와 온보딩 완료 직후에 연결을 명시 호출한다. 회귀 테스트 5건.
2. **Q2 재방문 중복 귀속** — Q1·Q2·Q4가 공통 `key_owner` CTE(브라우저 키 → 처음 연결된 계정 1개)를 쓰도록 바꿨다. Q4는 공유 브라우저 계정 수를 따로 보여 준다. 문서 SQL을 그대로 실행하는 PGlite 회귀 테스트 4건을 추가했다. 수정 전 문서로 실행하면 Codex 재현과 같이 `100.0`(기대 `50.0`)으로 실패하는 것을 확인했다.
3. **외부·직접 재유입을 이전 내부 화면으로 분류** — 직전 경로를 sessionStorage가 아니라 모듈 메모리에 둬서 새 문서 진입마다 초기화되게 했다. 새 문서는 referrer, 같은 문서 안 SPA 이동은 직전 경로로 판별한다. 회귀 테스트 1건(Google·직접 재진입, SPA 이동). 단, 연결부(`productEvents.ts`의 모듈 변수)는 단위 테스트가 아니라 코드 검토로만 확인했다.

- 검증: lint PASS, tsc PASS, build PASS(Node 24.15.0), `pnpm test` 196/198(실패 2건은 기존 `profile-role-release` 스냅샷, 변경 전과 동일), Prettier·`git diff --check` PASS.
- 미검증: Playwright·실제 OAuth/이메일 가입 흐름은 여전히 스테이징 필요.
- 함께 한 작업(다른 브랜치·설정): 협업 규칙 `CLAUDE.md`·`AGENTS.md` 반영(`docs/agent-collaboration-20261031`, `def2c0a`), Claude deny 규칙을 사용자 전역 설정에도 추가.

## Codex 재검토 결과 (`3474a6b`)

- SQL 중복 귀속과 외부 재진입 경로 분류는 해결 확인. 실제 productEvents 모듈도 문서별 격리 컨텍스트로 읽어 메모리 연결부를 검증했다.
- 가입 연결은 일반 pending 재시도는 동작하나, A 계정의 늦은 Promise reject가 계정 전환 후 B의 백오프를 설정해 pending 재시도를 소진시키는 P2 1건이 남았다. 구현 코드는 수정하지 않고 [같은 브랜치의 검토 기록](WORK_LOG_20261031_retention_stage0_review.md)에 재현·수정 방향을 추가했다.
- 검토자 직접 실행: 관련 26/26 PASS, 전체 196/198(기존 실패 2건), 실제 모듈 메모리 연결 확인 및 잔여 예외 경로 모의 재현. lint/tsc/build·실제 브라우저 가입 시연은 재실행하지 않았다.
- 판정: 재검토 미통과, 해당 예외 경로의 회귀 테스트·수정 후 재검토 필요. push·배포·운영 DB 변경 없음.

## Codex 재검토(`74d1220`) 잔여 P2 수정

- 재현 테스트 먼저 추가: A 계정 요청이 지연되다 계정 전환 후 reject되면 B의 pending 재시도가 10분 백오프로 끊기는 경로. 수정 전 코드에서 `'error' !== 'skipped'`로 실패함을 확인했다.
- 원인: 늦은 응답 무시 검사(`retryUser !== userId`)가 정상 resolve 경로에만 있고 reject의 `catch`에는 없었다.
- 수정: 계정 전환·로그아웃·연결 성공마다 증가하는 요청 세대 번호를 두고, resolve와 reject 모두 세대가 바뀌었으면 무시한다.
- 같은 검토 중 발견한 인접 경로도 수정: A 요청 진행 중 로그아웃 후 같은 A로 재로그인하면, 새 요청은 "A 진행 중"으로 건너뛰고 옛 요청은 세대 불일치로 무시돼 연결이 남지 않았다. 진행 중 판정을 사용자 대신 세대 기준으로 바꿨다. 회귀 테스트 추가(수정 전 실패 확인).
- 검증: identityLinker 7/7, lint·tsc·build PASS, `pnpm test` 198/200(실패 2건은 기존 `profile-role-release` 스냅샷과 동일), `git diff --check` PASS.

## Codex 최종 코드 재검토 (`3579136`)

- 남았던 늦은 Promise reject의 새 계정 백오프 오염은 요청 세대 확인으로 해소됐다. 같은 계정 재로그인과 오래된 finally 처리도 확인했다. 추가 결함 미발견, 지적했던 3건의 코드 재검토 통과.
- 직접 실행: identityLinker 7/7 PASS, 이전 독립 재현에서 B의 재시도 실행 확인, 전체 198/200(동일한 기존 실패 2건), 수정 파일 Prettier·diff PASS. lint/tsc/build와 실제 브라우저 시연은 이번 검토에서 재실행하지 않았다.
- [같은 브랜치의 검토 기록](WORK_LOG_20261031_retention_stage0_review.md)에 세부 근거와 한계를 추가했다. 구현 코드는 변경하지 않았다. 운영 반영·DB 적용·push 없음.
- 남은 단계: 격리된 스테이징에서 실제 가입·계정 연결 시연, 개인정보 문안·보존 기간 결정 및 사용자 직접 운영 반영. 코드 검토 통과와 전체 0단계 수락 완료는 구분한다.

## 정렬된 main 병합 (`e22a4d5`)

- 10/31 사고 후 `main`이 운영 웹 소스와 같아져(PR #14, `91fc839`) `origin/main`을 이 브랜치에 merge로 반영했다. 충돌 없음. 이 브랜치의 크롤러는 `main`과 동일하다.
- 재검증: 크롤러 323/323, lint·tsc·build PASS, `pnpm test` 198/200(기존 `profile-role-release` 스냅샷 2건), `git diff --check` PASS.
- `scripts/security/naver-emergency-stop.test.ts` 4/5: "GA integration preserves ... byte-for-byte" 1건이 실패한다. 10/25 GA 릴리스 시점의 `package.json`·`supabase/`를 고정한 검사라, 이 브랜치의 테스트 목록 추가와 신규 마이그레이션 때문에 예상된 실패다. 네이버 차단 동작 검사 4건은 통과한다. 보안 고정 검사 갱신은 사용자 승인 사항이라 수정하지 않았다(CI 대상 아님).
- 운영 반영에 필요한 결정: 마이그레이션 적용 승인, 개인정보 문안·보존 기간, 위 고정 검사 처리 방침. 웹 코드는 마이그레이션 전에 배포돼도 조용히 동작한다(RPC 실패는 10분 백오프, 조회 기록은 source 없이 저장).

## 보안 고정 검사 범위 조정 (검토 대기)

- 10/31 사용자가 `main` 배포 `8f6a164`를 Promote했다. 이제 `main` 병합은 곧 운영 배포다. 운영 확인(GET): `/api/auth/naver` 503, `/login` 중단 안내, 홈·목록·상세·`/privacy` 200.
- 문제: 릴리스 고정 검사 2건이 `supabase/`·`package.json`·`apps/web/app/onboarding` 전체를 바이트 단위로 묶어, 새 마이그레이션이나 테스트 등록만 해도 실패한다. 이 브랜치에서 `naver-emergency-stop` 1건, `ga4-naver-safe-release` 1건이 실패했다(후자는 이전 기록에 빠져 있었다).
- 결정: 보호 대상은 그대로 두고 허용 범위만 좁게 열었다.
  - 보안 파일 9개(+네이버 라우트 3개) 바이트 고정, `apps/web/app/api/admin`·`api/onboarding`·`apps/mobile`·`pnpm-lock.yaml` diff 0은 유지.
  - `supabase/`: 신규 `supabase/migrations/<14자리>_<이름>.sql` 추가만 허용. 적용된 마이그레이션 수정·삭제·이름 변경은 실패.
  - `package.json`: `scripts.test` 외 필드(의존성·다른 스크립트)는 동일해야 한다.
  - 최소 연령 기능(`release/minimum-age-*`) 유입 차단: 온보딩 화면과 신규 마이그레이션에 `ageConfirmed`·`만 14세`·`gate_unconfirmed_member` 등이 없어야 하고, 청소년 구간 문구 `13~18세`가 유지돼야 한다.
- 검증: `naver-emergency-stop` 5/5, `ga4-naver-safe-release` 3/3. 음성 검사로 기존 마이그레이션 수정, devDependency 추가, `release/minimum-age-rls`의 온보딩 화면·마이그레이션 반입, 다른 이름의 마이그레이션에 연령 식별자 추가가 모두 실패함을 확인했다(확인 후 원복).
- `scripts/security/*.test.ts` 100/103. 남은 3건(`profile-role-release` 2, `withdrawal-release` 1)은 `origin/main`에서도 동일하게 실패하는 기존 실패다.

## Codex 고정 검사 검토 (`4e3f38b`)

- [검토 기록](WORK_LOG_20261031_release_freeze_review.md)에 P2 2건을 남겼다. scripts.test를 no-op으로 바꿔도 통과하며, 블랙리스트 단어 없이 온보딩 또는 새 SQL에 연령 제한을 넣어도 통과한다. 실제 파일을 고치지 않고 원본 검사 callback을 메모리의 가상 입력으로 실행해 재현했다.
- 현재 두 파일 8/8 PASS, 기존 보안 파일·의존성·기준 migration 수정/삭제 차단은 유지됨을 확인했다. 실제 보호 코드가 이번 커밋에서 바뀐 것은 아니다.
- 판정: 이번 검사 완화는 재검토 미통과. 기존 검사 유지·새 테스트 추가만 허용하는 제한과 이름에 의존하지 않는 연령 기능 유입 차단을 보강한 뒤 재검토한다. 앞선 측정 기능 코드 통과와 별도로 취급한다.
- 구현·검사 코드 수정, push·배포·운영 DB 접근 없음. 검토 문서만 같은 브랜치에 로컬 커밋한다.

## Codex 재검토 반영: 블랙리스트 → 허용 목록

- [검토 기록](WORK_LOG_20261031_release_freeze_review.md)(`1a937df`)의 P2 2건: `scripts.test`를 통째로 바꿔도 통과, 금지어 없이 넣은 14세 제한(온보딩 출생연도 확인, `birth_date` CHECK 마이그레이션)이 통과.
- 원인: 금지 패턴을 나열하는 방식이라 이름만 바꾸면 우회된다. 허용한 것만 통과시키는 방식으로 바꿨다.
- `scripts/security/releaseFreezeAllowlist.ts`(신규):
  - `APPROVED_MIGRATIONS`: 신규 마이그레이션 경로 → 검토 완료 커밋. 목록에 없는 파일, 내용이 검토본과 다른 파일, 수정·삭제는 실패. 지금은 0단계 마이그레이션 1개(`3474a6b`, Codex `3579136` 통과본).
  - `APPROVED_SNAPSHOTS`: 온보딩 화면은 기준 커밋(`2faf121`) 또는 검토본(`3474a6b`)과 바이트 동일해야 한다.
  - `checkTestScript`: 기존 테스트 명령은 그대로 두고 끝에 실제 존재하는 `*.test.ts` 경로를 따옴표로 추가하는 것만 허용. 명령 교체, 기존 테스트 삭제, `|| true`, 옵션 주입, 중복, 없는 파일은 실패.
  - 이후 단계에서 마이그레이션이나 온보딩을 바꾸려면 이 파일에 검토 커밋을 추가해야 하므로, 그 변경 자체가 교차 검토 대상이 된다.
- 회귀 테스트 `scripts/security/release-freeze-allowlist.test.ts`(4건, 루트 `pnpm test` 등록): Codex 재현 사례(no-op 명령, 출생연도 마이그레이션, 검토본 이후 내용 추가, M·D 상태)를 포함한다.
- 실파일 음성 검사(확인 후 원복): 온보딩 출생연도 prompt 삽입, 신규 `birth_date` 마이그레이션, no-op 테스트 명령 모두 실패.
- 검증: 고정·허용 검사 12/12, `scripts/security/*.test.ts` 104/107, `pnpm test` 202/204. 남은 실패 3건은 `origin/main`과 같은 기존 실패(`profile-role-release` 2, `withdrawal-release` 1). Prettier·`git diff --check` PASS.
