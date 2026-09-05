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

## Google Play Console Progress

- 개발자 계정 신원 확인이 완료되어 첫 앱 생성을 진행할 수 있게 됐다.
- Play Console에서 `PosterLink` 앱을 생성했다.
  - 앱 이름: `PosterLink`
  - 패키지명: `com.maxmini.posterlink`
  - 기본 언어: 한국어(`ko-KR`)
  - 앱/게임: 앱
  - 무료/유료: 무료
- 스토어 등록정보 초안 저장 후 게시 개요에 변경사항이 표시되는 것을 확인했다.
- 앱 설정 완료 체크리스트의 개인정보처리방침 항목에 사용할 URL을 확정했다.
  - `https://www.posterlink.kr/privacy`
- 로그인 세부정보는 앱에 제한된 기능이 있으므로 `예`로 입력해야 한다.
  - Google Play 검토용 일반 사용자 테스트 계정이 필요하다.
  - 테스트 계정은 관리자/운영자 권한이 아닌 일반 사용자 권한으로 유지한다.
  - Play Console에는 실제 PosterLink 로그인이 가능한 이메일과 앱 로그인용 비밀번호를 제공한다.

## Still Blocked Or Manual

- Google Play Console 연락처 전화번호 인증 최종 상태 확인.
- Play Console Data safety, 계정 삭제, 앱 액세스, 콘텐츠 등급, 대상 연령 답변 최종 입력 및 제출.
- Google Play 검토용 일반 사용자 테스트 계정 생성 및 로그인 성공 확인.
- Android/iOS 실제 기기 설치, OAuth callback, 카메라/갤러리, push token 저장, 알림 딥링크 확인.
- `posterlink.co.kr` / `www.posterlink.co.kr` DNS 및 Vercel domain 연결. 현재 curl 기준 HTTP code `000`.
- Sentry 클라이언트 오류 실제 수집 여부는 Sentry 프로젝트 접근 또는 의도적 테스트 이벤트 확인이 필요하다.
- 관리자/운영자 비상 계정 확보.
- 운영 데이터 변경을 수반하는 공지 발송, 댓글 숨김/신고 기각, 사용자 역할 변경, 기준정보 변경 수동 검수.
- Supabase Advisor의 Auth leaked password protection, extension schema, 공개 RPC 권한 관련 후속 보안 점검.

## 2026-09-05 Follow-up

- Merged `origin/main` into `feat/ai-verification-phase-1` so the Google Play launch-progress docs are now present on the active AI verification branch.
- Pushed the merge to `origin/feat/ai-verification-phase-1` as `8a9911a`.
- Re-opened the Play Console app dashboard for `PosterLink`.
- Confirmed current Play Console state:
  - App name: `PosterLink`
  - Package: `com.maxmini.posterlink`
  - App status: draft
  - App setup progress: 3 of 11 completed
  - Completed setup items: app content information, privacy policy, login details, ads
  - Remaining setup items: content rating, target audience, data safety, government app, financial features, health, app category/contact details, store listing
  - Production access is still disabled until closed testing requirements are satisfied.
- Confirmed the production access gate shown in Play Console:
  - Publish a closed testing release.
  - At least 12 testers must opt in.
  - Run closed testing for at least 14 days with those testers.
- Rechecked local code signals for Play Console answers:
  - Mobile uses camera and photo library access for poster capture/upload.
  - Mobile uses Expo push notifications and stores Expo push tokens in user profiles.
  - Mobile uses local biometric authentication only on device.
  - Web/mobile account features use Supabase auth, profiles, favorites, notifications, reports, comments, search logs, and link-click logs.
  - Sentry is configured on the web app for error/diagnostic collection.

Next action:

- Prepare and confirm Play Console policy answers before saving them in the external console.
- Create/confirm a normal non-admin reviewer test account before entering login details in Play Console.
- Upload the existing Android AAB to a closed/internal testing track only after confirming the Google service account and target track.
