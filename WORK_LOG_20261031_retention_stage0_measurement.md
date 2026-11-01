# 재방문·가입 전환 0단계 측정

상태: 운영 반영 중 (구현 Claude, 검토 Codex) — ①② 적용, ④ 파기 예약 job 7(첫 실행 11/1 03:30 KST). 다음: ⑤ 첫 실행 확인 → `2c93d70` Codex 검토 → push → PR #16 병합. 인계는 문서 끝 "이어서 할 일"

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

## 보관 기간 파기 배치 (`edbfeac`, 허용 목록 등록은 다음 커밋)

- 결정(10/31 사용자): 방침 초안(`apps/web/app/privacy/policy.ts`)의 기간을 따른다. 원본 이용 기록·식별자 연결 3개월(KST 달력), 검색 원문과 방문 URL 쿼리·유입 URL 30일, 장기 비교는 식별자 없는 주별 집계만. 앞서 제안한 13개월은 초안을 확인하지 않은 제안이라 철회했다.
- `20261031020000_add_usage_log_retention.sql`: `usage_weekly_cohorts`, `snapshot_usage_weekly_cohorts()`, `usage_log_retention_cutoffs()`, `usage_log_retention_preview()`(dry-run), `run_usage_log_retention(p_batch)`. 적용해도 삭제하지 않는다. 한 실행에서 집계를 먼저 저장하고 단계별 최대 `p_batch`행을 정리한다. API 역할 실행 권한은 모두 회수했고 집계 표는 `service_role` 조회만 허용한다.
- `20261031030000_schedule_usage_log_retention.sql`: 매일 03:30 KST `pg_cron` 예약. dry-run 결과 승인 뒤에만 적용한다.
- 집계의 "신규"는 45일 무방문 후 방문이다. 원본이 3개월만 남아 전체 기간의 첫 방문을 알 수 없기 때문이며, 코호트는 주 시작 37일 뒤(원본이 약 52일 앞까지 남아 있을 때) 한 번 저장되고 바뀌지 않는다.
- 테스트 `scripts/retention/usage-log-retention.test.ts` 7건(PGlite): KST 달력 cutoff, dry-run 무삭제, cutoff ±1분 경계, 검색 원문 비우기, 활동 중인 키의 연결 유지, 배치 한도와 분할 정리, API 역할 권한, 집계 값(45일 간격·같은 날 재방문·봇 제외·미완료 주 제외), 집계 후 파기 순서와 저장된 주 불변. 첫 실행에서 `service_role`에 집계 표 쓰기 권한이 남는 문제를 테스트로 발견해 조회만 허용하도록 고쳤다.
- 운영 절차·롤백·알려진 영향: [usage_log_retention_runbook_20261031.md](docs/usage_log_retention_runbook_20261031.md). 운영자·관리자 리포트의 365일 선택은 활성화 후 3개월 이전이 비므로 기간 선택을 줄이는 후속 수정이 필요하다. 감사 기록 90일은 법정 보존 대상과 섞여 있어 제외했다.
- 방침 문안: [retention_metrics_20261031.md](docs/retention_metrics_20261031.md) 0-6에 확정 기간으로 갱신했다. "자동 파기" 문구는 예약 작업이 운영에서 실제로 실행된 뒤에만 게시한다(초안 문구는 보안 검사가 고정).
- 검증: 신규 7/7, `scripts/retention/*` 18/18, 고정·허용 검사 통과, `pnpm test` 209/211, `scripts/security/*` 104/107(남은 실패는 기존 3건). `pg_cron` 예약 SQL은 PGlite에 확장이 없어 실행하지 못했고 기존 `close-expired-posters-daily` 패턴을 따랐다.

## Codex 검토 반영: 신규 없는 주 집계 누락 (`c7e7d9c`)

- [검토 기록](WORK_LOG_20261031_usage_log_retention_review.md)(`0e191b6`) P2: 집계 대상 주를 "신규가 시작된 주"에서 골라, 기존 방문자만 온 주는 저장되지 않은 채 원본이 삭제됐다. 첫 실행 백필(약 110일 전 주)에서도 재현됐다.
- 수정: 원본 첫 방문 주부터 관찰이 끝난 모든 주를 기준으로 저장하고, 신규·재방문 수는 실제 시작 행을 LEFT JOIN해 센다. 신규가 없는 주와 방문이 없는 주도 0으로 저장해 "행 없음 = 아직 계산 안 됨"으로 구분한다.
- 회귀 테스트 3건 추가: 기존 방문자만 온 주(60일 전) `new 0 / active 1`, 첫 실행 백필(110일 전)에서 원본 삭제 전 저장, 방문 없는 주의 0 저장과 빈 주 없음. 수정 전 SQL로 되돌리면 이 3건이 실패함을 확인했다.
- 기존 테스트 1건은 0 주 저장으로 행 수 기대값이 달라져, p0 방문 주를 직접 확인하도록 단언을 바꿨다.
- 허용 목록의 두 파기 마이그레이션 기준 커밋을 `c7e7d9c`로 갱신했다(예약 마이그레이션 내용은 변경 없음).
- 검증: 파기 테스트 10/10, `scripts/retention/*` 21/21, `pnpm test` 212/214, `scripts/security/*` 104/107(남은 실패는 기존 3건), Prettier·`git diff --check` PASS.

## Codex 재검토 반영: 원본 만료 후 주 연속성 (`e5f8494`)

- [검토 기록](WORK_LOG_20261031_usage_log_retention_review.md)(`8092576`) P2: 주 목록 시작점이 남은 원본의 첫 방문이라, 원본이 모두 만료되면 이후 주가 저장되지 않고, 새 방문이 들어오면 그 사이 빈 주가 건너뛰어졌다.
- 수정:
  - 첫 실행만 원본 첫 방문 주에서 시작하고, 이후에는 마지막 저장 주의 다음 주부터 이어 간다. 저장 이력도 원본도 없는 최초 상태는 아무것도 저장하지 않는다.
  - 수집 시작 시점은 가장 오래된 저장 주로 보존한다.
  - 같은 근본 원인의 `lookback_complete` 판정도 고쳤다. 남은 원본의 최소 시각 대신 `usage_log_retention_state.raw_purged_before`(실행마다 적용한 원본 cutoff, 뒤로 가지 않음)를 기준으로, 직전 45일이 그 이전으로 넘어가는 주만 `false`로 표시한다. 상태 표는 API 역할 권한이 없다.
- 회귀 테스트 5건 추가: 원본 만료 후 다음 주 0 저장, 공백 뒤 새 방문에도 빈 주 연속, 최초 상태 무저장, cutoff 기준 lookback 판정, cutoff 기록 단조 증가와 권한. 수정 전 SQL(`c7e7d9c`)로 되돌리면 4건이 실패함을 확인했다(최초 상태 검사는 이전에도 통과).
- 허용 목록의 파기 마이그레이션 기준 커밋을 `e5f8494`로 갱신했다(예약 마이그레이션 내용은 변경 없음).
- 검증: 파기 테스트 15/15, `scripts/retention/*` 26/26, `pnpm test` 217/219, `scripts/security/*` 104/107(남은 실패는 기존 3건), Prettier·`git diff --check` PASS.

## Codex 재검토 반영: 수집 시작 시각 보존 (`1e69175`)

- [검토 기록](WORK_LOG_20261031_usage_log_retention_review.md)(`8e40f12`) P2: 원본이 파기되면 수집 시작점을 가장 오래된 저장 주의 월요일로 대신해, 토요일에 수집을 시작한 경우 그 앞 월~금을 관찰한 것으로 보고 `lookback_complete = true`를 저장했다(저장 후 고정).
- 수정: `usage_log_retention_state.collection_started_at`에 실제 첫 방문 시각을 저장한다. 집계 함수가 파기 전에 매번 `LEAST`로 갱신하므로 앞으로만 당겨지고, 원본이 사라져도 유지된다. 저장 주로 대신하는 계산은 없앴다. 시작 시각을 모르면 `lookback_complete = false`.
- 회귀 테스트 2건 추가: 토요일 시작 경계(직전 45일이 금요일에 걸리는 주는 `false`, 다음 주는 `true`), 첫 방문 원본 파기 후에도 정확한 시각 유지. 기존 lookback 테스트는 시작 시각을 상태 표에 넣도록 고쳤다. 수정 전 SQL(`e5f8494`)로 되돌리면 3건이 실패함을 확인했다.
- 허용 목록의 파기 마이그레이션 기준 커밋을 `1e69175`로 갱신했다.
- 검증: 파기 테스트 17/17, `scripts/retention/*` 28/28, `pnpm test` 219/221, `scripts/security/*` 104/107(남은 실패는 기존 3건), Prettier·`git diff --check` PASS.

## 운영 반영 ①: 0단계 마이그레이션 적용 (2026-11-01 00:57 KST 확인)

- 사전 점검(사용자 SQL Editor, 조회만): 필요 컬럼·기존 제약 존재, 새 제약·테이블·함수 이름 충돌 없음, 알림 이벤트 필수값 누락 0건, `pg_cron 1.6.4` 설치 10/10 통과. 규모: `site_visit_logs` 4,079건(7/18~), `poster_view_logs` 919, `poster_link_click_logs` 80, `search_logs` 45, `product_events` 41.
- 적용: 사용자가 SQL Editor에서 Codex 통과본(`3474a6b`)과 동일한 마이그레이션을 `BEGIN`~`COMMIT`으로 한 번에 실행, "Success. No rows returned". 실행 파일 SHA-256(LF) `fa57e52eaf652eb507dfe6b878712a21d8815b38f1a29a868b37f91e20a8b743`. 실행 전 같은 파일을 PGlite에서 적용 확인. migration history INSERT는 하지 않았다(10/23 역할 보안 적용과 같은 방식).
- 적용 후 확인 8/8: 새 컬럼 5개, 새 제약 3개와 가입완료 1회 인덱스, 연결 표 RLS, anon·authenticated 연결 표 조회 불가, anon 연결 RPC 실행 불가, 이벤트 RPC 실행 가능, `poster_view_logs.source`, 기존 이벤트 41건 유지.
- 운영 웹(GET): `/`·`/posters` 200, `/api/auth/naver` 503 유지. 운영 웹은 새 RPC를 호출하지 않으므로 화면 변화 없음.

## 방침 게시·관리자 화면 준비 (PR #16 병합 시 반영)

- 운영 반영 순서상 이 변경은 ⑤ 첫 파기 실행 확인 뒤 PR #16 병합으로만 운영에 나간다. 병합 전에 예약이 실제로 돌지 않았다면 "매일 자동 파기" 문구가 사실이 아니므로 병합하지 않는다.
- `apps/web/app/privacy/page.tsx`(운영 공개 방침): 자동 수집 항목에 이용 행태·방문자 식별자·계정 연결 기록 추가, 브라우저 저장소 안내 문단, 이용 목적 구체화, 보유 기간에 이용 기록 3개월·검색 원문 30일·식별 불가 주별 집계 별도 보관과 회원 정보 삭제 시 연결 처리 추가. 최종 업데이트 2026년 11월 1일(병합일이 다르면 병합 전에 맞춘다). `policy.ts`(B 초안, 미게시)는 바꾸지 않았다.
- `apps/web/app/admin/traffic/page.tsx`: 기간 선택에서 1년 제거(원본 3개월). API(`/api/admin/traffic`)는 보안 고정 범위라 바꾸지 않았고 직접 `days=365`를 넣으면 3개월치만 나온다.
- `apps/web/app/admin/page.tsx`: "공식 링크 클릭" → "공식 링크 클릭 (최근 3개월)". 운영자 리포트 화면은 30일 고정이라 변경 없음.
- 검증: web lint PASS, build PASS, `pnpm test` 219/221·`scripts/security/*` 104/107(기존 실패만), `git diff --check` PASS. `/privacy`를 로컬 production 빌드로 모바일 375px·데스크톱 1280px 확인(가로 넘침 없음, 목록 구조 유지). Supabase·`/api/*` 요청은 브라우저에서 차단해 운영 DB에 쓰지 않았다. 관리자 화면은 로그인이 필요해 화면 확인을 하지 않았다(상수·라벨 변경만).
- 관리자 파일 2개는 수정 전부터 Prettier 형식이 아니어서 전체 재포맷하지 않았다.
- ④ 예약 실행 파일: Codex 통과본과 동일, SHA-256(LF) `bd5055c32e5e529db45142b6fca2f8d8b4aac1c0912e6640e92cb409c7312ffb`.

## 운영 반영 ②·③: 파기 함수 적용과 삭제 예정 건수 (2026-11-01 01:05 KST 무렵)

- ② 사용자가 Codex 통과본(`1e69175`)과 동일한 함수 마이그레이션을 SQL Editor에서 `BEGIN`~`COMMIT`으로 실행, "Success. No rows returned". 실행 파일 SHA-256(LF) `54c0c496c1114e31c31706735ec34164334bedad354f3f56f940976f85b4677d`. 삭제 없음.
- ③ `usage_log_retention_preview()`(조회): cutoff 원본 2026-08-01 01:04:58 KST, 검색 2026-10-02 01:04:58 KST.
  - `site_visit_logs` 삭제 833(전체 4,079), URL 쿼리·유입 URL 비우기 988
  - `poster_view_logs` 삭제 245(919), `poster_link_click_logs` 삭제 50(80), `search_logs` 삭제 28(45)
  - `product_events`·`visitor_identity_links` 0
- API 역할 실행 불가 `true`, 예약 없음 `true`. ④ 예약은 사용자 명시 승인 대기.

## 운영 반영 ④: 파기 예약 등록 (2026-11-01 01:07 KST 무렵)

- 사용자가 ③ 건수를 확인한 뒤 Codex 통과본과 동일한 예약 마이그레이션을 SQL Editor에서 실행했다. 실행 파일 SHA-256(LF) `bd5055c32e5e529db45142b6fca2f8d8b4aac1c0912e6640e92cb409c7312ffb`. 결과 `schedule = 6`이 표시됐지만 **등록이 남지 않았다**(아래 정정).
- 첫 실행 예정: 2026-11-01 03:30 KST(`30 18 * * *` UTC). 실행 전 취소: `select cron.unschedule('usage-log-retention-daily');`.
- 남은 확인: `cron.job` 등록 상태, 첫 실행 후 `cron.job_run_details`, preview 0 수렴, `usage_weekly_cohorts`·`usage_log_retention_state` 기록.

- **정정(01:10 KST 무렵)**: 확인 조회에서 `cron.job`에 job 6이 없고 실행 기록도 0건이었다(기존 job 3·4·5만, 모두 `postgres`). `BEGIN`~`COMMIT` 안의 `cron.schedule`이 롤백되고 job id 시퀀스만 소모된 것으로 판단한다. ①·② 같은 방식의 DDL은 정상 반영됐으므로 결과를 반환하는 SELECT가 든 트랜잭션을 SQL Editor가 다르게 처리한 것으로 보이나 원인은 확정하지 못했다. 이 동안 파기는 실행되지 않았다.
- 재등록: `cron.schedule('usage-log-retention-daily', '30 18 * * *', ...)` 단일 문장을 트랜잭션 없이 실행 → job **7**. 조회 확인 `7 / usage-log-retention-daily / 30 18 * * * / postgres / active=true`. 첫 실행 2026-11-01 03:30 KST.
- 교훈: SQL Editor에서 `cron.schedule`은 트랜잭션으로 감싸지 않고 실행하고, 반환된 job id만 믿지 말고 `cron.job` 조회로 등록을 확인한다(운영 절차에 반영).

## 이어서 할 일 (2026-11-01 01:15 KST 기준 인계)

운영 상태:

- 운영 웹 = `main` `8f6a164`(Promote 완료). `main` 병합은 곧 운영 배포다.
- 운영 DB: ① 0단계 마이그레이션, ② 파기 함수 적용 완료. ④ 파기 예약 `usage-log-retention-daily` = **job 7**(job 6은 롤백됨), 첫 실행 2026-11-01 03:30 KST.
- PR #16(Draft)은 `fe28458`까지 push됨. 이후 로컬 커밋 6개(`df7544e`..`e08a9ff`, 방침·관리자 화면 `2c93d70` 포함)는 **push 전**.

다음 순서:

1. ⑤ 첫 실행 확인: 운영 절차 문서의 확인 쿼리(job 이름으로 조회)를 03:30 이후 실행. 기대: `succeeded`, 삭제 대상 0 근처(실행 직전 미리보기: 방문 833·URL 비우기 988·조회 245·클릭 50·검색 28), 주별 집계 7월 중순부터, 수집 시작 7/19 00:34 KST. `failed`면 `return_message` 확인(한 트랜잭션이라 삭제 없음).
2. Codex 검토: `2c93d70`(공개 방침·관리자 화면). 요청 문구는 대화 기록 참고: 방침 문구가 실제 수집·파기 구현과 맞는지.
3. push → PR #16 Ready → **merge commit**으로 병합(=운영 배포, 방침 게시·새 이벤트 수집 시작). 병합일이 11/1이 아니면 `apps/web/app/privacy/page.tsx`의 "최종 업데이트" 날짜를 먼저 맞춘다. ⑤가 성공하기 전에는 병합하지 않는다.
4. 병합 후: 운영 GET 확인(`/api/auth/naver` 503, `/privacy` 새 문구), `docs/release-markers.md`에 반영 시각 기록(측정 시작일), 이벤트 유입 확인(`product_events` 최근 1일 이벤트별 건수).

남은 결정·후속:

- 1단계(지역 정리): B 지시서 원문, 스테이징 환경 필요. 크롤러 보류 커밋 `8a426db`는 1단계 검증 후 revert.
- 운영자 리포트 API(`/api/admin/traffic`)는 보안 고정 범위라 `days=365` 직접 호출 시 3개월치만 나온다(화면 선택지는 제거).
- 감사 기록 90일 파기는 법정 보존 대상 분리 후 별도 작업.

## 병합 전 검토 수정 (Codex `dfa3ac6`, 2026-11-01)

대상: `2c93d70`(방침 문구)·`82ad5e0`(운영 읽기 전용 대조 SQL). 검토 기록: [WORK_LOG_20261101_retention_privacy_premerge_review.md](WORK_LOG_20261101_retention_privacy_premerge_review.md).

- P2-1 방침과 실제 파기 기준 불일치: 연결 기록은 "생성 후 3개월"이 아니라, 마지막 연결 후 3개월이 지나고 그 식별자의 최근 3개월 이용 기록이 없을 때 파기한다(구현 그대로). 방침을 기록 종류별 기준으로 나눠 고쳤고, 브라우저 식별자는 서버 파기와 별개로 자동 만료되지 않는다는 문장을 더했다. 구현은 바꾸지 않았다.
- P2-2 대조 SQL이 제약 내용·유일 인덱스·함수 설정을 놓침: 3절을 한 개의 판정 쿼리로 바꿨다. 행마다 ok·실제·기대를 보여 준다.
  - 이번 마이그레이션이 만든 제약 13개를 `pg_get_constraintdef`로, 인덱스 4개(가입 완료 1회 유일 인덱스 포함)를 `pg_get_indexdef`·유일·유효 여부로 비교한다. FK의 삭제 동작도 정의에 포함된다.
  - 함수 6개는 본문 md5와 언어·SECURITY DEFINER·`proconfig`(search_path)를 함께 비교하고, 같은 이름의 다른 오버로드가 없는지 본다.
  - 예약 작업 이름·주기·명령·활성 여부, 함수·테이블 권한, RLS, 추가 컬럼도 같은 형식으로 판정한다.
  - 기대값은 PGlite에서 실제 마이그레이션으로 만든 값이다. 서버 버전에 따라 정의 문자열 표기가 다를 수 있다는 점을 머리말에 적었다.
- P2-3 집계 누락 검사가 저장된 최소·최대 주 사이만 봄: 마지막 성공 실행 시각 기준으로, 집계 함수와 같은 규칙(한국시간 주, 주 종료 후 30일)으로 닫힌 마지막 주를 계산하고, 첫 저장 주(수집 시작 주보다 앞서면 실패)부터 그 주까지 빠진 주를 한 줄씩 보고한다. 성공한 실행이 없거나 수집 시작 기록이 없거나 집계가 비면 실패다.
- 새 테스트 [pre-merge-readonly-check.test.ts](scripts/retention/pre-merge-readonly-check.test.ts) 3건: 마이그레이션 그대로인 DB는 모든 행 통과. 유일 인덱스 삭제, CHECK를 `CHECK (true)`로 교체, search_path 초기화, FK 삭제 동작 변경, 테이블 권한 추가, 예약 비활성, 최근 주 삭제, 집계 전체 삭제, 성공 실행 없음이 각각 해당 행의 실패로 나온다. PGlite 준비 코드는 [retentionTestDb.ts](scripts/retention/retentionTestDb.ts)로 분리했다.
- P3(90일 선택과 달력 3개월 차이, 링크 클릭 합계의 기간 조건)는 이번에 고치지 않았다. 화면 일부 기간에 데이터가 비는 표시 문제로, 별도 작업으로 남긴다.
- 검증: `scripts/retention/*` 31/31, `pnpm test` 222/224·`scripts/security/*` 104/107(실패는 모두 기존 실패), web lint·build 통과. 운영 DB 접속 없음.

## 병합 전 재검토 수정 (Codex `9b0ed9d`)

- P2 첫 집계 주 삭제를 놓침: 누락 검사를 남아 있는 첫 주가 아니라 **수집 시작 주**부터 한다. 첫 저장 주가 수집 시작 주와 다르면 실패로 보고, 다르면 그 주의 첫 방문이 모두 집계 제외(자동·운영자) 방문이었는지 확인하라고 SQL에 적었다.
- P2 함수 소유자를 검사하지 않음: 함수 6개의 소유자를 기대값(`postgres`)과 비교한다. 권한 없는 역할로 바뀌면 실패다.
- P2 예약 명령을 부분 문자열로 검사: 공백만 정리한 명령 전체가 `select * from public.run_usage_log_retention(50000);`와 같아야 하고, 작업이 하나뿐이며 실행 계정이 `postgres`여야 한다.
- 테스트 추가: 첫 주 삭제, 함수 소유자 변경, 함수 이름만 문자열로 조회하는 명령. 세 경우 모두 해당 행의 실패로 나오며, 고치기 전 SQL에서는 이 테스트가 실패함을 확인했다.
- 검증: `scripts/retention/*` 31/31, `git diff --check` 통과.

## 운영 읽기 전용 대조 결과 (2026-11-01 17:20 KST 무렵, Claude)

- 방법: `scripts/retention/pre-merge-readonly-check.sql`을 psql 17.11로 Session pooler에 접속해 실행했다. 세션 첫 명령 `SET default_transaction_read_only = on`(확인값 `on`), 스크립트 자체도 `BEGIN TRANSACTION READ ONLY` … `ROLLBACK`. 쓰기 없음. 접속 정보는 출력·기록하지 않았다.
- 대상 확인: 접속 사용자 `postgres.<앱과 같은 ref>`, PostgreSQL 17.6.
- **⑤ job 7 첫 실행**: `usage-log-retention-daily`(job 7, `30 18 * * *`, 활성) 실행 1건, runid 390, 2026-10-31 18:30:00 UTC(= 11/01 03:30 KST) **succeeded**, `8 rows`(단계별 결과 8행).
- 상태: 수집 시작 2026-07-18 15:34 UTC(= 07/19 00:34 KST), `raw_purged_before` 2026-07-31 18:30 UTC.
- 주별 집계: 2026-07-13 주 ~ 2026-09-21 주, 11주(lookback 불완전 8주: 수집 초기 주라 정상). 마지막 실행 기준 닫힌 주가 모두 저장됨(빠진 주 0).
- 삭제 예정(미리보기): 모두 0, URL 쿼리 비우기 2건(첫 실행 뒤 새로 30일이 지난 행).
- **판정 62행 전부 일치**(실패 0): 예약 작업, 함수 6개(본문 md5·언어·보안 모드·search_path·소유자 `postgres`, 다른 오버로드 없음), 제약 13개, 인덱스 4개(가입 완료 1회 유일 인덱스 포함), 함수·테이블 권한, RLS, 컬럼, 집계.
- 참고: CLI 이력 표 `supabase_migrations.schema_migrations`의 마지막 기록은 `20260924030000`(89건). `20261023010000` 이후 마이그레이션은 SQL로 직접 적용돼 이력에 없다. 이 상태에서 `supabase db push`를 쓰면 이미 적용된 파일을 다시 적용하려 할 수 있으므로, 앞으로도 적용은 SQL 직접 실행 + 이번 같은 대조로 한다(또는 이력 정리를 별도 승인 작업으로).
