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

## 이어서 작업하기

### 현재 저장소 상태

- 2026-08-12 기준 `main` 브랜치에 반영 및 GitHub `origin/main` 푸시 완료.
- 마지막 반영 커밋:
  - `1ed63df Enhance mobile app iOS readiness`
  - `359d8f8 Add iOS simulator development client`
  - `c31a332 Fix iOS production build dependencies`
  - `fbd958f Remove dev client from production iOS build`
  - `14899a6 Record iOS production build result`
- `expo-dev-client`는 production/TestFlight 빌드 충돌 때문에 최종 상태에서 제거했다.
- iOS production 빌드는 `expo-device` Xcode 26 패치와 `@babel/runtime` 명시 의존성이 있어야 재현된다.

### 바로 확인할 명령

```bash
git fetch origin
git status --short --branch
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile exec expo config --type public
```

### 빌드 재현

```bash
pnpm --dir apps/mobile build:ios:production -- --non-interactive
```

- 마지막 성공 production 빌드:
  - EAS build ID: `8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2`
  - Build number: `9`
  - IPA: https://expo.dev/artifacts/eas/bWx-rcph4K68oVLd7eim_T0aq1FqcXkR09nblyXzQyY.ipa
- EAS가 `autoIncrement`로 `ios.buildNumber`를 올릴 수 있으므로 빌드 후 `apps/mobile/app.json`의 `expo.ios.buildNumber` 변경 여부를 확인하고 커밋한다.

### 제출 재시도 전제

현재 제출 실패 원인은 코드나 IPA 문제가 아니라 App Store Connect API Key 권한 문제다.

실패 확인:

```bash
pnpm dlx eas-cli@latest submit:status --platform ios
```

확인된 오류 요지:

- EAS credentials의 App Store Connect API Key는 존재한다.
- 그러나 해당 키가 `com.maxmini.posterlink` 앱을 App Store Connect에서 찾을 권한이 없다.

해결 후 제출 명령:

```bash
pnpm --dir apps/mobile submit:ios -- --non-interactive --latest
```

또는 특정 빌드를 명시:

```bash
pnpm --dir apps/mobile exec eas submit --platform ios --profile production --id 8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2 --non-interactive
```

필요한 조치:

- App Store Connect에서 `com.maxmini.posterlink` 앱 접근 권한이 있는 API Key를 생성하거나 기존 키 권한을 수정한다.
- EAS credentials에 새 키를 등록한다.
- 대안으로 `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`를 제출 환경에 제공한다.

### 실제 기기 테스트 체크리스트

- OAuth 딥링크: `com.maxmini.posterlink://auth-callback`
- 웹앱 세션 브리지와 로그아웃 동기화
- 푸시 토큰 저장: `profiles.expo_push_token`
- 일반 사용자 퀵 액션: `찾기`, `마감`, `요청`
- 운영자/관리자 포스터 촬영 및 이미지 업로드
- 카메라/갤러리/Face ID 권한 문구가 iOS에서 한국어로 표시되는지 확인

## 2026-08-16 재개 확인

### 확인한 상태

- `git fetch origin`, `git status --short --branch`
  - 결과: `main...origin/main`, 작업 트리 깨끗함.
- EAS 로그인:
  - `pnpm --dir apps/mobile exec eas whoami`
  - 결과: `maxmini`, `maxmini0130@gmail.com`
- 모바일 검증:
  - `pnpm --dir apps/mobile typecheck` 통과
  - `pnpm --dir apps/mobile exec expo config --type public` 통과
  - iOS 설정상 `bundleIdentifier = com.maxmini.posterlink`, `buildNumber = 9` 유지 확인

### 다시 막힌 지점

`pnpm dlx eas-cli@latest submit:status --platform ios`를 재실행했으나 같은 오류가 유지됐다.

오류 요지:

- EAS credentials service의 App Store Connect API Key를 사용하려고 시도함.
- 그러나 해당 키로 App Store Connect에서 `com.maxmini.posterlink` 앱을 찾을 수 없음.
- 현재 세션에는 아래 환경변수도 없음:
  - `EXPO_ASC_API_KEY_PATH`
  - `EXPO_ASC_KEY_ID`
  - `EXPO_ASC_ISSUER_ID`

### 다음 진행 조건

아래 둘 중 하나가 필요하다.

1. EAS credentials에 `com.maxmini.posterlink` 앱 접근 권한이 있는 App Store Connect API Key를 다시 등록한다.
2. 로컬/CI 제출 환경에 아래 값을 제공한다.
   - `EXPO_ASC_API_KEY_PATH`
   - `EXPO_ASC_KEY_ID`
   - `EXPO_ASC_ISSUER_ID`

권한 해결 후 재시도:

```bash
pnpm --dir apps/mobile exec eas submit --platform ios --profile production --id 8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2 --non-interactive
```

또는 최신 빌드 기준:

```bash
pnpm --dir apps/mobile submit:ios -- --non-interactive --latest
```
