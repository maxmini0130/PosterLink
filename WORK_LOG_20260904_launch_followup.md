# 2026-09-04 launch follow-up verification

## Scope

원격 `origin/main` 현행화 후 출시 전 남은 작업 중 Codex가 자동으로 확인 가능한 항목을 재검증했다. 운영 데이터 변경, 외부 콘솔 승인, 실기기 확인이 필요한 항목은 수행하지 않고 차단 사유를 분리했다.

## Completed Checks

- `git fetch origin` 후 `main...origin/main` 차이 없음 확인.
- `pnpm.cmd test` 통과: 57 passed.
- `pnpm.cmd --filter web lint` 통과.
- `pnpm.cmd --filter web exec tsc --noEmit --pretty false` 통과.
- `pnpm.cmd --filter web build` 통과.
- `pnpm.cmd --dir apps/mobile typecheck` 통과.
- `pnpm.cmd --dir apps/mobile check:play-readiness` 통과.
- `pnpm.cmd --filter posterlink-crawler test` 통과: 142 passed.
- `pnpm.cmd dlx supabase db lint --linked` 통과: `No schema errors found`.
- `pnpm.cmd dlx supabase functions list` 확인:
  - `process-ocr` ACTIVE v13
  - `check-deadlines` ACTIVE v7
  - `notify-new-match` ACTIVE v5
- `pnpm.cmd --dir apps/mobile exec expo install --check` 통과.
- `pnpm.cmd --dir apps/mobile dlx expo-doctor` 통과: 18/18.
- `pnpm.cmd --dir apps/mobile exec expo config --type public` 정상 출력 확인.
- 운영 URL curl 확인:
  - `https://www.posterlink.kr/privacy` 200
  - `https://www.posterlink.kr/terms` 200
  - `https://www.posterlink.kr/robots.txt` 200
  - `https://www.posterlink.kr/sitemap.xml` 200
  - `https://www.posterlink.kr/opengraph-image` 200
  - `https://posterlink.kr` 200
- Vercel production inspect 확인:
  - deployment `dpl_4BdNYWRQhnwUzPgSdhPKbkAJUEDB`
  - status `Ready`
  - aliases: `https://www.posterlink.kr`, `https://posterlink.kr`, `https://poster-link-web.vercel.app`, `https://poster-link-web-maxmini0130s-projects.vercel.app`

## Audit Notes

- `pnpm.cmd audit:phase1` 전체 실행은 로컬 Supabase reset 단계에서 기존과 같은 `LegacyLocalDbRunningError: failed to inspect service`로 실패했다.
- 현재 PATH에서 `docker` 명령을 찾을 수 없어 이 세션에서 로컬 Supabase container/service 정리는 진행하지 못했다.
- `pnpm.cmd audit:phase1 -- --skip-db-reset`은 공개 테스트 50개와 관리자 테스트 14개가 통과하는 데까지 확인했다.
  - `E2E_USER_EMAIL`과 `E2E_OPERATOR_EMAIL`이 없어 사용자 11개, 운영자 4개 테스트는 스킵됐다.
  - 테스트 항목은 모두 출력됐으나 Playwright 프로세스가 종료 처리에서 멈춰 수동으로 중단했다.
- 처음 skip-db-reset audit 실행에서는 Next dev server가 `SUPABASE_SERVICE_ROLE_KEY`를 읽지 못해 `supabaseKey is required` 로그가 반복됐다.
  - 원인: 루트 `.env.local`에는 서버 키가 있지만 `apps/web/.env.local`에는 공개 Supabase 키만 있다.
  - 비밀값을 파일에 복사하지 않고, 검증 프로세스에 루트 env를 주입해 재실행했을 때 해당 오류는 사라졌다.
- `pnpm.cmd install --frozen-lockfile`로 pull 이후 누락된 모바일 의존성 트리를 lockfile 기준으로 재동기화했다.

## Still Blocked Or Manual

- Google Play Console 개발자 계정 신원 확인과 연락처 전화번호 인증.
- Play Console Data safety, 계정 삭제, 앱 액세스, 콘텐츠 등급, 대상 연령 답변 최종 입력.
- Android/iOS 실제 기기 설치, OAuth callback, 카메라/갤러리, push token 저장, 알림 딥링크 확인.
- `posterlink.co.kr` / `www.posterlink.co.kr` DNS 및 Vercel domain 연결. 현재 curl 기준 HTTP code `000`.
- Sentry 클라이언트 오류 실제 수집 여부는 Sentry 프로젝트 접근 또는 의도적 테스트 이벤트 확인이 필요하다.
- 관리자/운영자 비상 계정 확보.
- 운영 데이터 변경을 수반하는 공지 발송, 댓글 숨김/신고 기각, 사용자 역할 변경, 기준정보 변경 수동 검수.
- Supabase Advisor의 Auth leaked password protection, extension schema, 공개 RPC 권한 관련 후속 보안 점검.
