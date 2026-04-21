# 2026-04-21 모바일 앱 EAS Build 설정 작업 기록

## 개요

PosterLink 모바일 앱(Expo SDK 50)의 Android APK를 EAS Build로 빌드하기 위한 설정 작업을 진행했습니다.
pnpm 모노레포 환경에서 EAS 클라우드 빌드가 정상 동작하도록 여러 이슈를 해결했습니다.

## 빌드 결과

- **플랫폼**: Android (preview profile)
- **빌드 링크**: https://expo.dev/accounts/maxmini/projects/posterlink-mobile/builds/3d083d73-ae15-42c9-b7d8-9901d4f85714
- **EAS Project ID**: `dd58cb12-9739-4dfb-bcda-6bc4947094b0`
- **Bundle ID / Package**: `com.maxmini.posterlink`

## 변경 파일 목록

### 신규 생성

| 파일 | 설명 |
|------|------|
| `.npmrc` | `shamefully-hoist=true` 설정 (pnpm + React Native 호환성) |
| `apps/mobile/babel.config.js` | Expo Metro 번들링에 필수인 Babel 설정 |
| `apps/mobile/metro.config.js` | 모노레포 모듈 해석 경로 설정 |
| `apps/mobile/eas.json` | EAS Build 프로필 (development/preview/production) |
| `apps/mobile/assets/icon.png` | 앱 아이콘 (1024x1024, 플레이스홀더) |
| `apps/mobile/assets/adaptive-icon.png` | Android adaptive 아이콘 (1024x1024, 플레이스홀더) |
| `apps/mobile/assets/splash.png` | 스플래시 화면 (1284x2778, 플레이스홀더) |
| `apps/mobile/assets/favicon.png` | 웹 파비콘 (48x48, 플레이스홀더) |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `.gitignore` | `android/`, `ios/` 디렉토리 제외 추가 (expo prebuild 생성물) |
| `apps/mobile/app.json` | EAS projectId, owner, Supabase 환경변수, Android 권한 추가 |
| `apps/mobile/package.json` | workspace 의존성 제거, SDK 호환 의존성 추가/업데이트 |
| `apps/mobile/src/lib/supabase.ts` | 하드코딩 → expo-constants로 환경변수 로드 방식 변경 |
| `pnpm-lock.yaml` | 의존성 변경에 따른 lockfile 갱신 |

## 해결한 이슈들

### 1. 에셋 파일 누락 (빌드 실패)

- **증상**: `apps/mobile/assets/` 디렉토리가 없어서 EAS Build가 실패
- **해결**: icon.png, adaptive-icon.png, splash.png, favicon.png 플레이스홀더 생성
- **참고**: 추후 실제 디자인 에셋으로 교체 필요

### 2. Expo SDK 호환 의존성 불일치 (expo-doctor 경고)

- **증상**: `expo-camera@14.0.6`, `react-native@0.73.4` 버전이 SDK 50과 불일치
- **해결**: `npx expo install --fix`로 호환 버전 설치
  - `expo-camera` → `~14.1.3`
  - `react-native` → `0.73.6`

### 3. Babel 설정 누락 (Metro 번들링 실패)

- **증상**: `createBundleReleaseJsAndAssets` 태스크에서 node exit code 1
- **원인**: `babel.config.js`가 없어서 JSX/TypeScript 변환 불가
- **해결**: `babel.config.js` 생성 + `babel-preset-expo@^10.0.2` 설치

### 4. expo-asset 패키지 누락

- **증상**: `The required package 'expo-asset' cannot be found`
- **원인**: `metro.config.js`에서 `expo/metro-config`를 사용할 때 내부적으로 필요
- **해결**: `npx expo install expo-asset` → `~9.0.2`

### 5. pnpm strict 모듈 해석 (핵심 이슈)

- **증상**: `Cannot find module '@react-native/assets-registry/registry.js'`
- **원인**: pnpm은 기본적으로 명시적으로 선언하지 않은 패키지에 접근 불가 (phantom dependency 차단)
- **1차 시도**: `@react-native/assets-registry` 직접 설치 → 부분 해결
- **2차 시도**: `.npmrc`에 `node-linker=hoisted` → Gradle entryFile 해석 실패
- **최종 해결**: `.npmrc`에 `shamefully-hoist=true` 설정
  - pnpm의 구조는 유지하되 모든 패키지를 루트 node_modules에 호이스팅
  - React Native 생태계의 암묵적 의존성 문제를 한번에 해결

### 6. Supabase 환경변수 미설정

- **증상**: `supabase.ts`에 `YOUR_SUPABASE_URL` 플레이스홀더가 남아있음
- **해결**: `app.json`의 `extra` 필드에 Supabase URL/Key 추가 → `expo-constants`로 로드

### 7. workspace 의존성 (EAS 빌드 불가)

- **증상**: `@posterlink/lib`, `@posterlink/types`의 `workspace:*` 참조를 EAS 클라우드에서 해석 불가
- **확인**: 모바일 코드에서 실제로 import하지 않음
- **해결**: `package.json`에서 제거

## 아키텍처 메모

```
PosterLink (pnpm monorepo)
├── .npmrc                  ← shamefully-hoist=true (React Native 호환)
├── apps/
│   ├── web/                ← Next.js 14 (Vercel 배포)
│   └── mobile/             ← Expo SDK 50 (EAS Build)
│       ├── app.json        ← EAS projectId, Supabase config
│       ├── eas.json        ← build profiles
│       ├── babel.config.js ← babel-preset-expo
│       ├── metro.config.js ← monorepo watchFolders
│       └── App.tsx         ← 카메라 촬영 + 로그인 + 푸시알림
└── packages/
    ├── lib/
    ├── types/
    └── ui/
```

## 다음 단계

- [ ] 앱 에셋(아이콘, 스플래시)을 실제 디자인으로 교체
- [ ] iOS 빌드 진행 (Apple Developer 계정 필요)
- [ ] 생체인식 로그인 구현 (expo-local-authentication)
- [ ] 네이버 로그인 실제 구현 (현재 placeholder)
- [ ] production 프로필 빌드 및 스토어 배포
