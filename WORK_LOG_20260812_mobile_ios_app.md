# 2026-08-12 모바일 앱 고도화 및 iOS 준비

## 목적

- 기존 Expo 모바일 앱을 iOS 빌드/제출까지 이어질 수 있게 정리한다.
- 웹앱 래퍼 구조는 유지하면서 모바일 사용자에게 자주 필요한 경로를 빠르게 제공한다.
- 권한 요청은 실제 기능에 필요한 범위로 줄인다.

## 변경

- `apps/mobile/package.json`
  - 패키지명을 루트 스크립트와 맞춰 `@posterlink/mobile`로 변경했다.
  - iOS 시뮬레이터, 프리뷰, 프로덕션 빌드와 App Store 제출 스크립트를 추가했다.
  - iOS development client 빌드를 위해 `expo-dev-client`를 추가했다.
- `apps/mobile/app.json`
  - iOS `buildNumber`를 `6`으로 올렸다.
  - `expo-camera` 플러그인을 옵션형으로 바꾸고 마이크 권한 및 Android 녹음 권한을 제거했다.
- `apps/mobile/App.tsx`
  - WebView 위에 `찾기`, `마감`, `요청` 퀵 액션을 추가했다.
  - 인증 화면에서는 퀵 액션을 숨기고, 사용자가 닫을 수 있게 했다.
  - 모든 퀵 액션 이동에 기존 앱 추적 파라미터를 유지했다.
- `docs/2026-04-21-mobile-eas-build.md`
  - iOS 빌드 명령과 실제 TestFlight 업로드 전 체크 항목을 기록했다.

## 검증

- `pnpm --dir apps/mobile typecheck`
- `pnpm --filter @posterlink/mobile typecheck`
- `pnpm --dir apps/mobile exec expo config --type public`
- `pnpm --dir apps/mobile ios:simulator -- --non-interactive`
  - 성공 빌드: https://expo.dev/accounts/maxmini/projects/posterlink-mobile/builds/efca4206-92d4-4fe2-8273-f10373038be3
- 추가 검증 예정:
  - Apple Developer 계정으로 `pnpm --dir apps/mobile build:ios:preview`

## 남은 일

- Apple Developer 인증 후 EAS iOS preview 빌드를 실행한다.
- 내부 배포용 iOS credentials를 EAS remote credentials에 구성한다.
- TestFlight 내부 테스트에서 OAuth 콜백, 푸시 토큰 저장, 포스터 촬영 업로드를 실제 기기에서 확인한다.
