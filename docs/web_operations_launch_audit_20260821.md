# 웹/운영 출시 점검 기록

기준일: 2026-08-21

앱/EAS/Google Play 실기기 항목을 제외하고, 웹 서비스와 운영 환경 중심으로 확인한 결과다.

## 자동 검증 결과

- `pnpm --filter web lint` 통과
- `pnpm --filter web build` 통과
- `pnpm --filter web exec tsc --noEmit --pretty false` 통과
- `pnpm --dir apps/web exec playwright test e2e/authenticated/user/onboarding.spec.ts --project=user` 11/11 통과
- `pnpm --dir apps/web exec playwright test e2e/authenticated/operator/posters.spec.ts --project=operator` 3 passed, 1 skipped
- `pnpm --dir apps/web exec playwright test e2e/authenticated/admin/review.spec.ts --project=admin` 11/11 통과
- `pnpm --dir apps/web exec playwright test e2e/authenticated/admin --project=admin` 15/15 통과
- `pnpm --dir apps/web test:e2e` 96 passed, 19 skipped 통과
  - 최초 실패는 실제 화면이 렌더링된 뒤 `networkidle`/`load` 대기에서 타임아웃난 테스트 안정성 문제였다.
  - 사용자/운영자 인증 E2E는 의미 있는 화면 요소 기준으로 수정했다.
  - 관리자 E2E는 루트 `.env.local`과 `apps/web/.env.local`의 테스트 계정 비밀번호 불일치를 로컬에서 동기화한 뒤 정상 통과했다.

## 운영 도메인

- `https://www.posterlink.kr/privacy` 200 확인
- `https://www.posterlink.kr/terms` 200 확인
- `https://www.posterlink.kr/robots.txt` 200 확인
- `https://www.posterlink.kr/sitemap.xml` 200 확인
- `https://www.posterlink.kr/opengraph-image` 200, `image/png` 확인
- `posterlink.co.kr`과 `www.posterlink.co.kr`은 DNS resolve 실패로 아직 연결되지 않았다.

## 보안/환경

- 빌드 산출물 `apps/web/.next`에서 `SUPABASE_SERVICE_ROLE_KEY` 실제 값이 발견되지 않았다.
- 공개 변수인 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`은 빌드 산출물에 포함된다.
- Supabase Edge Function secret 목록에서 다음 이름이 확인됐다.
  - `OPENAI_API_KEY`
  - `TAVILY_API_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_URL`
  - Supabase 자동 주입 secret 계열
- Supabase Edge Function 배포 상태:
  - `process-ocr`: ACTIVE
  - `check-deadlines`: ACTIVE
  - `notify-new-match`: ACTIVE
- Vercel production/preview 환경에는 `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, Supabase 공개 키, Naver OAuth 키, Sentry 키가 확인됐다.
- Vercel Production 환경에는 웹 API가 사용하는 `OPENAI_API_KEY`를 등록했다.
  - 적용 배포: `dpl_6MqTKWwz4sUGifMghCzttDnn7Fk4`
  - Production alias: `https://www.posterlink.kr`
  - `POST /api/posters/semantic-search` 운영 호출에서 `semantic: true`, `model: text-embedding-3-small` 응답을 확인했다.
  - Preview 환경은 Vercel CLI가 preview git branch 선택을 요구해 이번 자동 등록 범위에서 제외했다.
- Vercel 환경에는 `KAKAO_ADMIN_KEY`가 확인되지 않았다.
  - 영향 범위: Kakao 계정 탈퇴 시 Kakao unlink 요청은 생략되고 PosterLink 계정 삭제는 계속 진행된다.
- 2026-08-23 환경변수 동기화 재확인:
  - Production 런타임 필수 키(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `OPENAI_API_KEY`)는 Vercel에 존재한다.
  - Sentry 배포 키(`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)와 Production DSN(`NEXT_PUBLIC_SENTRY_DSN`)이 Vercel에 존재한다.
  - `KAKAO_ADMIN_KEY`는 선택 항목으로 보류 중이다.
  - `OPENAI_API_KEY` Preview 등록은 Vercel CLI preview branch 요구로 보류 중이며, Production 동작은 smoke test로 확인했다.
- Sentry 설정 재확인:
  - `apps/web/next.config.mjs`의 `withSentryConfig`는 `org: posterlink`, `project: posterlink-web`를 사용한다.
  - `errorHandler`가 source map 업로드 실패를 빌드 실패로 전파하지 않고 경고로 처리한다.
  - 서버/클라이언트 instrumentation은 production이고 DSN이 `https://`로 시작할 때만 활성화된다.
- Supabase Edge Function 로그 조회 절차를 정리했다.
  - runbook: `docs/edge_function_logs_runbook_20260823.md`
  - Supabase CLI는 원격 함수 로그 조회 명령을 제공하지 않아 배포 상태 확인에만 사용한다.
  - 실제 실행 로그는 Supabase Dashboard의 `Logs` 또는 `Edge Functions` 화면에서 함수 slug, 시간 범위, status, invocation id 기준으로 확인한다.
  - `check-deadlines`와 `notify-new-match`는 알림 레코드 생성 또는 실제 push 발송이 발생할 수 있어 운영 수동 호출은 별도 승인 후 진행한다.
- Vercel production 배포 상태:
  - `vercel inspect www.posterlink.kr` 결과 deployment `dpl_6Zd1mAqyZEmfxHjpia8vFc4b6YNF`가 `Ready` 상태다.
  - aliases: `https://www.posterlink.kr`, `https://posterlink.kr`, `https://poster-link-web.vercel.app`

## Supabase DB/Storage

- 원격 `supabase db lint --linked` 최초 결과에서 legacy RPC 오류 3건을 발견했다.
  - `get_popular_regions`: `varchar`/`text` 반환 타입 불일치
  - `get_recommended_posters`: 반환 타입 불일치
  - `get_blocked_user_ids`: 존재하지 않는 `public.blocks` 참조
- migration 적용 후 `supabase db lint --linked` 결과: `No schema errors found`
- Storage bucket 확인:
  - `poster-originals`: public bucket
  - `poster-requests`: public bucket
- `get_popular_regions`, `get_recommended_posters` RPC는 service role 읽기 호출에서 정상 응답을 반환했다.
- 운영 DB RLS 재확인:
  - `public`/`storage`의 앱 사용 테이블 전체에서 RLS 활성화를 확인했다.
  - 핵심 테이블(`profiles`, `posters`, `poster_links`, `poster_images`, `comments`, `favorites`, `notifications`, `poster_requests`, `institution_follows`, `collection_sources`, `poster_notice_candidates` 등)에 정책이 존재한다.
  - Supabase security advisor는 RLS 누락이 아닌 함수 `search_path`, 공개 schema extension, `SECURITY DEFINER` RPC 실행 권한, Auth leaked password protection 경고를 별도 후속 항목으로 보고했다.

## 남은 수동/운영 작업

- `posterlink.co.kr` / `www.posterlink.co.kr` DNS 및 Vercel domain 연결
- Vercel Production에 `OPENAI_API_KEY` 추가 및 production 재배포 완료
- Vercel에 `KAKAO_ADMIN_KEY` 추가 여부 결정
  - Kakao 앱 연결 해제까지 탈퇴 UX를 정리하기 위한 선택 항목이다.
  - 현재는 출시 블로커로 보지 않고 다음 작업으로 보류한다.
- Supabase Auth provider redirect URL을 운영 도메인 기준으로 대시보드에서 최종 확인 완료
  - Supabase CLI는 Auth redirect URL 읽기 명령을 제공하지 않고 `config push`만 제공한다.
  - 대시보드에서 Site URL을 `https://www.posterlink.kr`로 변경했다.
  - Redirect URLs에 `https://www.posterlink.kr/auth/callback`, `https://www.posterlink.kr/reset-password`, `com.maxmini.posterlink://auth-callback`을 확인했다.
  - 운영 Naver OAuth 진입은 `https://www.posterlink.kr/api/auth/naver/callback`을 `redirect_uri`로 생성하는 것을 확인했다.
- Supabase Edge Function 로그 조회 절차 확인 완료
  - 현재 함수 목록: `process-ocr` ACTIVE v11, `check-deadlines` ACTIVE v5, `notify-new-match` ACTIVE v4
  - 세부 절차는 `docs/edge_function_logs_runbook_20260823.md`에 기록했다.
- Playwright 관리자 E2E 계정 자격증명 복구 확인
  - `E2E_ADMIN_EMAIL` 계정은 루트 `.env.local` 기준으로 로그인 가능하다.
  - 웹 E2E가 읽는 `apps/web/.env.local`의 `E2E_ADMIN_PASSWORD`를 루트 값과 로컬 동기화했다.
  - 관리자 인증 E2E는 15/15 통과했다.
- 실제 브라우저에서 Google/Kakao/Naver OAuth 로그인 1회씩 수동 확인
- 관리자 공지 발송, 댓글 숨김/신고 기각, 사용자 역할 변경은 운영 데이터 변경을 수반하므로 다음 작업으로 보류한다.
  - 실행 시 테스트 대상과 원복 범위를 먼저 정한 뒤 별도 승인 절차로 진행한다.
- Supabase security advisor 경고 정리
  - RLS 활성화 상태와 별개로 함수/권한/Auth 보안 설정을 후속 점검한다.
  - 1차/2차 low-risk hardening migration을 운영 DB에 적용했다.
  - 공개 검색/추천 RPC, extension schema, Auth leaked password protection은 별도 후속으로 남겼다.
