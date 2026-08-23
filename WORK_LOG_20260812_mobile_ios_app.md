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
- App Store Connect 앱 정보 사용자 확인:
  - Apple ID: `6769311952`
  - Bundle ID: `com.maxmini.posterlink`
  - `apps/mobile/eas.json`의 `submit.production.ios.ascAppId`와 `expo.ios.bundleIdentifier`가 App Store Connect 값과 일치함

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

비밀키 보관 주의:

- `.p8` App Store Connect API Key는 저장소에 커밋하지 않는다.
- `.gitignore`에 `*.p8`, `apps/mobile/private/`를 추가했다.
- 권장 로컬 저장 위치: `apps/mobile/private/EASSubmitPosterLink.p8`

권한 해결 후 재시도:

```bash
pnpm --dir apps/mobile exec eas submit --platform ios --profile production --id 8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2 --non-interactive
```

또는 최신 빌드 기준:

```bash
pnpm --dir apps/mobile submit:ios -- --non-interactive --latest
```

## 2026-08-16 ASC API Key 파일 확인 및 제출 재시도

### 새 키 확인

- 로컬 키 파일: `apps/mobile/private/EASSubmitPosterLink.p8`
- Key ID: `P8X435BU66`
- Issuer ID: `540c4483-383a-44fa-a970-f22700fce50a`
- 키 파일 형식 확인:
  - `-----BEGIN PRIVATE KEY-----`
  - `-----END PRIVATE KEY-----`
- `apps/mobile/eas.json` submit profile에 local ASC API Key 경로와 ID를 명시했다.
- `.p8` 파일은 `.gitignore`에 의해 커밋 제외된다.

### 제출 재시도 결과

명령:

```bash
pnpm dlx eas-cli@latest submit --platform ios --profile production --id 8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2 --non-interactive --verbose
```

결과:

- EAS Submit이 새 로컬 키를 인식했다.
  - `Key ID: P8X435BU66`
  - `Key Source: local`
  - `Key Path: ./private/EASSubmitPosterLink.p8`
- `ASC App ID: 6769311952`도 정상 인식했다.
- 제출은 예약됐으나 App Store Connect 제출 단계에서 실패했다.
  - Submission: `d64f1b92-93a0-4f0e-8b4b-68bf81d8044a`

새 오류:

```text
Apple 403 detected - Access forbidden.
A required agreement is missing or has expired.
This request requires an in-effect agreement that has not been signed or has expired.
```

### 다음 진행 조건

- App Store Connect에서 만료/미서명 계약을 처리해야 한다.
- 확인 위치:
  - App Store Connect 상단 `비즈니스`
  - 계약/세금/은행 또는 계약 관련 메뉴
  - 미해결 계약, 유료 앱 계약, Apple Developer Program License Agreement 등 표시되는 항목을 수락/완료
- 계약 처리 후 같은 제출 명령을 다시 실행한다.

## 2026-08-16 iOS 제출 성공

### 재확인

- `git fetch origin`, `git status --short --branch`
  - 결과: `main...origin/main`, 작업 트리 깨끗함
- `pnpm --dir apps/mobile typecheck`
  - 결과: 통과
- Apple Developer 계정 화면에서 `Apple Developer Program License Agreement` 수락 상태 확인:
  - 발행일: `2026년 3월 31일`
  - 수락일: `2026년 5월 14일`

### 제출 결과

명령:

```bash
pnpm dlx eas-cli@latest submit --platform ios --profile production --id 8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2 --non-interactive --verbose
```

결과:

- EAS Submit이 로컬 App Store Connect API Key를 사용했다.
  - `Key ID: P8X435BU66`
  - `Key Source: local`
  - `Key Path: ./private/EASSubmitPosterLink.p8`
- `ASC App ID: 6769311952` 정상 인식.
- TestFlight 그룹 생성:
  - `Team (Expo)`
- iOS 제출 성공:
  - Submission: `ea363c52-958d-40c1-8a0e-10cb6a855563`
  - Build ID: `8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2`
  - App Version: `1.0.0`
  - Build number: `9`
  - App Store Connect TestFlight: https://appstoreconnect.apple.com/apps/6769311952/testflight/ios

### 다음 단계

- Apple의 빌드 처리 완료 이메일을 기다린다. 보통 5-10분 정도 걸릴 수 있다.
- 처리 완료 후 App Store Connect > PosterLink > TestFlight > iOS에서 빌드 `1.0.0 (9)`를 확인한다.
- 내부 테스터 또는 TestFlight 그룹에 빌드를 배정한다.
- App Store 심사를 진행하려면 스크린샷, 앱 심사 정보, 개인정보 처리 항목, 수출 규정, 콘텐츠 권리, 연락처/규정 준수 항목을 완료한다.

## 2026-08-16 TestFlight 실제 기기 설치

- App Store Connect > TestFlight > 내부 테스팅 `Team (Expo)` 그룹에 빌드 `1.0.0 (9)`가 배정됐다.
- 사용자 iPhone에 TestFlight를 통해 PosterLink 설치 완료.
- 다음 단계는 실제 기기 QA:
  - 앱 실행 및 웹뷰 로딩
  - 로그인/로그아웃
  - OAuth 리디렉션
  - 포스터 촬영/사진 업로드 권한
  - 주요 빠른 동작 버튼
  - 푸시 토큰/알림 권한
  - iOS 권한 문구와 화면 깨짐 여부

## 2026-08-16 네이버 로그인 모바일 복귀 수정

### 실제 기기 QA에서 확인한 문제

- iPhone TestFlight 앱에서 네이버 로그인이 WebView 안에서 진행됐다.
- 네이버 앱이 없고 아이디/비밀번호로 로그인하면 인증 후 PosterLink 앱으로 돌아오지 않고 네이버 메인 화면이 표시됐다.
- 해당 상태에서 앱 안 뒤로가기도 어려웠다.

### 수정 내용

- 모바일 WebView에서 `/api/auth/naver` 접근을 감지하면 로딩을 중단하고 `WebBrowser.openAuthSessionAsync`로 네이티브 인증 세션을 연다.
- 네이버 OAuth 시작 라우트가 모바일 요청일 때 허용된 앱 스킴 `com.maxmini.posterlink://auth-callback`을 임시 쿠키에 저장한다.
- 네이버 OAuth 콜백이 모바일 요청이면 Supabase 세션 생성 후 앱 딥링크로 `access_token`, `refresh_token`, `next`를 돌려준다.
- 모바일 앱은 딥링크 토큰을 받아 네이티브 Supabase 세션과 WebView 쿠키/localStorage 세션을 주입한다.
- 신규 사용자 온보딩이 필요한 경우 `next=/onboarding` 경로로 앱 WebView를 이동할 수 있게 했다.
- iOS `buildNumber`를 `10`으로 올려 TestFlight 재배포를 준비했다.

### 검증

- `pnpm --dir apps/mobile typecheck` 통과
- `pnpm --filter web lint` 통과
- `pnpm --filter web build` 통과

### 다음 단계

- 변경사항 커밋/푸시 후 iOS production build `1.0.0 (10)` 생성.
- App Store Connect/TestFlight 업로드 후 iPhone에서 네이버 로그인 재검증.

### iOS 재빌드 및 제출 결과

- 커밋/푸시:
  - `9b94edd Fix mobile Naver OAuth return flow`
- EAS iOS production build 성공:
  - EAS build ID: `aa1162cb-17b5-4526-b4c7-c7010772ce54`
  - IPA: https://expo.dev/artifacts/eas/INHgm2EN8GHDnbzfaWMklD3G5hLlr8FMvIFIbqTU_3s.ipa
  - EAS `autoIncrement`에 의해 실제 build number는 `11`이 됐다.
- App Store Connect 제출 성공:
  - Submission: `83ceb7b4-818e-4593-873b-c11e9a9740b5`
  - App Version: `1.0.0`
  - Build number: `11`
  - TestFlight: https://appstoreconnect.apple.com/apps/6769311952/testflight/ios
- 다음 확인:
  - Apple 처리 완료 후 TestFlight 내부 테스팅 그룹에 빌드 `1.0.0 (11)` 배정.
  - iPhone에서 기존 TestFlight 앱을 업데이트하고 네이버 로그인 재검증.

## 2026-08-19 Android Google Play 준비

### 공식 기준 확인

- Google Play 신규 개인 개발자 계정은 프로덕션 접근 전에 비공개 테스트 요건이 적용될 수 있다.
  - 최소 12명 테스터가 참여하는 closed test 요건을 확인해야 한다.
  - 참고: https://support.google.com/googleplay/android-developer/answer/14151465
- EAS Submit Android는 AAB를 Google Play Console의 internal/alpha/beta/production 트랙에 업로드할 수 있다.
  - 참고: https://docs.expo.dev/submit/android/

### 저장소 준비

- Android production AAB 빌드 스크립트를 추가했다.
  - `pnpm --dir apps/mobile build:android:production`
- Android preview APK 빌드 스크립트를 추가했다.
  - `pnpm --dir apps/mobile android:preview`
- Android submit 스크립트를 추가했다.
  - `pnpm --dir apps/mobile submit:android`
- Play Console 업로드용 `versionCode`를 `2`로 올렸다.
- 현재 Android package:
  - `com.maxmini.posterlink`

### 다음 단계

- `pnpm --dir apps/mobile typecheck`로 모바일 타입 확인.
- EAS Android production build로 AAB 생성.
- Google Play Console에서 앱 `PosterLink` 생성 후 package `com.maxmini.posterlink` 확인.
- 처음에는 내부 테스트 또는 비공개 테스트 트랙에 AAB 업로드.
- EAS submit 자동화를 쓰려면 Google Play service account JSON을 `apps/mobile/google-service-account.json`에 로컬로만 보관하거나 EAS credentials에 등록한다. JSON 키는 커밋하지 않는다.

### Android production build 요청

- 검증:
  - `pnpm --dir apps/mobile typecheck` 통과
  - `pnpm --dir apps/mobile exec expo config --type public`에서 Android package `com.maxmini.posterlink`, versionCode `2` 확인
- EAS Android production build를 시작했다.
  - Build ID: `fce3b843-020b-41b8-ad86-7ff713272345`
  - Profile: `production`
  - Distribution: `store`
  - App Version: `1.0.0`
  - EAS `autoIncrement`에 의해 실제 version code는 `3`으로 갱신됐다.
  - Logs: https://expo.dev/accounts/maxmini/projects/posterlink-mobile/builds/fce3b843-020b-41b8-ad86-7ff713272345
- 2026-08-19 00:10 KST 기준 상태:
  - `in queue`
  - Application Archive URL: 아직 없음

### 이어서 할 일

- 빌드 완료 확인:
  - `pnpm dlx eas-cli@latest build:list --platform android --limit 1 --non-interactive`
- 완료 후 AAB URL을 기록하고 Play Console에 업로드한다.
- Play Console 자동 제출은 서비스 계정 JSON 준비 후 진행한다.

### Android production build 완료

- 2026-08-19 재확인 결과 Android production build가 완료됐다.
  - Build ID: `fce3b843-020b-41b8-ad86-7ff713272345`
  - App Version: `1.0.0`
  - Version code: `3`
  - AAB: https://expo.dev/artifacts/eas/vlqtSarJQbmqne4PQCDmt8ukqhQsLRbZw3HGiMTEFXw.aab
  - Finished at: `2026-08-19 00:48:45 KST`
- Google Play 자동 제출용 서비스 계정 JSON은 저장소에 커밋하지 않는다.
- EAS Android submit profile의 서비스 계정 키 경로를 ignore된 위치로 변경했다.
  - `apps/mobile/private/google-service-account.json`

### Google Play Console 수동 업로드 경로

- Play Console에서 앱 `PosterLink`를 생성한다.
  - 패키지명: `com.maxmini.posterlink`
  - 앱 유형: 앱
  - 가격: 무료
- `테스트 및 출시`에서 우선 `내부 테스트` 또는 계정 요건에 따라 `비공개 테스트` 트랙을 만든다.
- 새 버전 만들기에서 위 AAB를 업로드한다.
- 앱 콘텐츠 필수 항목을 완료한다.
  - 개인정보처리방침
  - 데이터 보안
  - 콘텐츠 등급
  - 타겟층/아동 대상 여부
  - 광고 여부
  - 앱 액세스 권한
  - 데이터 삭제/계정 삭제 안내

### Google Play 개발자 계정 설정 상태

- Google Play Console 개인 개발자 계정을 생성했다.
  - 개발자명: `MMaxx`
  - 계정 유형: 개인
- Play Console 홈에서 앱 생성 버튼은 아직 비활성화 상태다.
- 본인 확인:
  - 신원 확인 문서 업로드 완료.
  - 현재 상태: `Google에서 신원 확인 중입니다`.
  - Google 검토 완료 후 계정 소유자 이메일로 결과가 온다.
- 남은 계정 설정:
  - 연락처 전화번호 인증을 완료해야 한다.
  - Android 휴대기기 액세스 확인 항목이 완료됐는지 Play Console 모바일 앱/웹에서 확인한다.

### 다음 재개 액션

1. Play Console에서 연락처 전화번호 인증을 완료한다.
2. Google 신원 확인 완료 이메일을 기다린다.
3. `앱 만들기` 버튼이 활성화되면 앱을 생성한다.
   - 앱 이름: `PosterLink`
   - 기본 언어: `한국어`
   - 앱 또는 게임: 앱
   - 가격: 무료
4. 패키지명 `com.maxmini.posterlink`로 AAB를 내부 테스트 또는 비공개 테스트 트랙에 업로드한다.
5. 업로드할 AAB:
   - Version: `1.0.0`
   - Version code: `3`
   - URL: https://expo.dev/artifacts/eas/vlqtSarJQbmqne4PQCDmt8ukqhQsLRbZw3HGiMTEFXw.aab
6. 앱 콘텐츠 필수 항목과 스토어 등록정보를 작성한다.
7. 신규 개인 개발자 계정 정책상 비공개 테스트 요건이 표시되면 해당 요건을 먼저 충족한다.

## 2026-08-23 관리자 E2E 계정 복구

- `e2e.admin@posterlink.kr` 테스트 계정의 새 비밀번호가 루트 `.env.local`에는 반영됐지만, 웹 E2E가 읽는 `apps/web/.env.local`에는 반영되지 않아 관리자 인증 E2E가 스킵됐다.
- 비밀값을 출력하지 않고 `E2E_ADMIN_PASSWORD`만 루트 `.env.local`에서 `apps/web/.env.local`로 로컬 동기화했다.
- 관리자 로그인은 `apps/web/.env.local` 기준으로 성공했다.
- 검증:
  - `pnpm --dir apps/web exec playwright test e2e/authenticated/admin/review.spec.ts --project=admin --reporter=list` 11/11 통과
  - `pnpm --dir apps/web exec playwright test e2e/authenticated/admin --project=admin --reporter=list` 15/15 통과
- `notice-candidates` E2E의 중복 비교 모달에서 `현재 후보` 텍스트가 `현재 후보 제외` 버튼과 함께 매칭되던 strict locator를 정확 일치로 고정했다.

## 2026-08-23 Vercel OPENAI_API_KEY 운영 반영

- Vercel `poster-link-web` Production environment에 `OPENAI_API_KEY`를 등록했다.
- Production 재배포를 실행해 새 환경변수를 운영 함수에 반영했다.
  - Deployment ID: `dpl_6MqTKWwz4sUGifMghCzttDnn7Fk4`
  - Production alias: `https://www.posterlink.kr`
- 운영 검증:
  - `POST https://www.posterlink.kr/api/posters/semantic-search`가 `semantic: true`, `model: text-embedding-3-small`로 응답했다.
  - `GET https://www.posterlink.kr/login` 200 응답을 확인했다.
  - `GET https://www.posterlink.kr/api/auth/naver`는 `https://www.posterlink.kr/api/auth/naver/callback`을 `redirect_uri`로 사용한다.
- Preview environment는 Vercel CLI가 preview git branch 선택을 요구해 이번 자동 등록 범위에서 제외했다.
- `KAKAO_ADMIN_KEY`는 로컬 env와 Vercel 모두에서 값이 확인되지 않아 등록하지 않았다.
- Supabase Auth provider redirect URL은 대시보드에서 최종 확인했다.
  - Site URL: `https://www.posterlink.kr`
  - Redirect URLs: `https://www.posterlink.kr/auth/callback`, `https://www.posterlink.kr/reset-password`, `com.maxmini.posterlink://auth-callback`
  - 운영 `GET https://www.posterlink.kr/reset-password` 200 응답을 확인했다.
