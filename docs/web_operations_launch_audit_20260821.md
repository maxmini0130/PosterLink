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
- Vercel 환경에는 웹 API가 사용하는 `OPENAI_API_KEY`가 확인되지 않았다.
  - 영향 범위: `/api/posters/semantic-search`, `/api/operator/posters/draft`, `/api/operator/performance-report`
  - semantic search는 키가 없으면 fallback 응답을 반환하지만, 운영자 AI 초안은 503을 반환한다.
- Vercel 환경에는 `KAKAO_ADMIN_KEY`가 확인되지 않았다.
  - 영향 범위: Kakao 계정 탈퇴 시 Kakao unlink 요청은 생략되고 PosterLink 계정 삭제는 계속 진행된다.

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

## 남은 수동/운영 작업

- `posterlink.co.kr` / `www.posterlink.co.kr` DNS 및 Vercel domain 연결
- Vercel에 `OPENAI_API_KEY` 추가 여부 결정
- Vercel에 `KAKAO_ADMIN_KEY` 추가 여부 결정
- Supabase Auth provider redirect URL을 운영 도메인 기준으로 대시보드에서 최종 확인
- Playwright 관리자 E2E 계정 자격증명 복구 확인
  - `E2E_ADMIN_EMAIL` 계정은 루트 `.env.local` 기준으로 로그인 가능하다.
  - 웹 E2E가 읽는 `apps/web/.env.local`의 `E2E_ADMIN_PASSWORD`를 루트 값과 로컬 동기화했다.
  - 관리자 인증 E2E는 15/15 통과했다.
- 실제 브라우저에서 Google/Kakao/Naver OAuth 로그인 1회씩 수동 확인
- 관리자 공지 발송, 댓글 숨김/신고 기각, 사용자 역할 변경은 운영 데이터 변경을 수반하므로 별도 승인 절차로 실행
