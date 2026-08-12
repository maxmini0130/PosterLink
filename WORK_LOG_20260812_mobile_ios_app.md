# 2026-08-12 모바일 앱 고도화 및 iOS 준비

## 목적

- 기존 Expo 모바일 앱을 iOS 빌드/제출까지 이어질 수 있게 정리한다.
- 웹앱 래퍼 구조는 유지하면서 모바일 사용자에게 자주 필요한 경로를 빠르게 제공한다.
- 권한 요청은 실제 기능에 필요한 범위로 줄인다.

## 변경

- `apps/mobile/package.json`
  - 패키지명을 루트 스크립트와 맞춰 `@posterlink/mobile`로 변경했다.
  - iOS 시뮬레이터, 프리뷰, 프로덕션 빌드와 App Store 제출 스크립트를 추가했다.
  - iOS production 빌드에 필요한 `@babel/runtime`을 명시 의존성으로 추가했다.
- `apps/mobile/app.json`
  - iOS `buildNumber`를 `9`로 올렸다.
  - `expo-camera` 플러그인을 옵션형으로 바꾸고 마이크 권한 및 Android 녹음 권한을 제거했다.
- `apps/mobile/eas.json`
  - production 빌드에 dev menu가 포함되지 않도록 development profile의 `developmentClient` 설정을 제거했다.
- `apps/mobile/scripts/patch-expo-device-xcode26.js`
  - Xcode 26 시뮬레이터 판별 패치를 `TARGET_OS_SIMULATOR`, `TARGET_IPHONE_SIMULATOR` 양쪽에 대응하도록 보강했다.
- `package.json`
  - EAS 원격 설치에서도 `expo-device` 패치가 실행되도록 루트 `postinstall`을 추가했다.
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
- `pnpm --dir apps/mobile build:ios:production -- --non-interactive`
  - 성공 빌드: https://expo.dev/accounts/maxmini/projects/posterlink-mobile/builds/8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2
  - IPA: https://expo.dev/artifacts/eas/bWx-rcph4K68oVLd7eim_T0aq1FqcXkR09nblyXzQyY.ipa
- `pnpm --dir apps/mobile submit:ios -- --non-interactive --latest`
  - EAS Submit 예약 후 App Store Connect 제출 단계에서 실패
  - 실패 submission: `54514071-e1b2-4ba0-b9cd-36d326266931`
  - `pnpm dlx eas-cli@latest submit:status --platform ios` 결과, EAS에 등록된 App Store Connect API Key가 `com.maxmini.posterlink` 앱을 찾을 권한이 없음

## 남은 일

- App Store Connect에서 `com.maxmini.posterlink` 접근 권한이 있는 API Key를 새로 만들거나 기존 EAS API Key 권한을 수정한 뒤 iOS submit을 재시도한다.
- 내부 배포용 iOS credentials를 EAS remote credentials에 구성한다.
- TestFlight 내부 테스트에서 OAuth 콜백, 푸시 토큰 저장, 포스터 촬영 업로드를 실제 기기에서 확인한다.
