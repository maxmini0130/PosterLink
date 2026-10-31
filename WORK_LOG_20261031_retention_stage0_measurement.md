# 재방문·가입 전환 0단계 측정

상태: 검토 대기 (구현 Claude, 검토 Codex) — `3474a6b` 재검토: 수정 필요 1건, 다음 수정본 대기

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
