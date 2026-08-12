# 2026-04-21 작업 기록

## 오늘 완료한 항목

### 1. 모바일 EAS Build (Android APK)

- **플랫폼**: Android (preview profile)
- **빌드 링크**: https://expo.dev/accounts/maxmini/projects/posterlink-mobile/builds/3d083d73-ae15-42c9-b7d8-9901d4f85714
- **EAS Project ID**: `dd58cb12-9739-4dfb-bcda-6bc4947094b0`
- **Bundle ID / Package**: `com.maxmini.posterlink`

pnpm 모노레포 환경에서 EAS 클라우드 빌드가 동작하도록 설정 완료.

해결한 이슈:
- 에셋 파일 누락 → 플레이스홀더 생성
- Expo SDK 호환 의존성 불일치 → `expo-camera` 14.1.3, `react-native` 0.73.6
- Babel/Metro 설정 누락 → `babel.config.js`, `metro.config.js` 생성
- `expo-asset` 패키지 누락 → 설치
- pnpm strict 모듈 해석 → `.npmrc`에 `shamefully-hoist=true`
- Supabase 환경변수 → `app.json` extra + `expo-constants`
- workspace 의존성 → 미사용 확인 후 제거

### 2. 앱 아이콘/스플래시 교체

- 커스텀 디자인 아이콘(`posterlink_icon_1.png`) 적용 — 포스터+링크 모티프
- icon.png, adaptive-icon.png, favicon.png 1024x1024 / 48x48로 크롭/리사이즈
- `posterlink_icon_2.png` (PL 그라데이션 아이콘) 추가 보관

### 3. 웹 헤더 아이콘 추가

- `posterlink_icon_2.png`를 웹 헤더 로고로 적용
- `apps/web/public/logo.png` + Header.tsx에 `next/image` 추가

### 4. 카카오 로그인

- Supabase Kakao provider 활성화 (Save 누락 해결)
- 카카오 동의항목 설정: `profile_nickname`, `profile_image`, `account_email`
- KOE205 에러 해결: `account_email` 권한 없음 → 비즈앱 전환 후 동의항목 추가
- 코드에서 카카오 scope 명시 (`profile_nickname profile_image`)
- 로그인/회원가입 페이지 모두 적용

### 5. OCR Edge Function (process-ocr)

- JWT 알고리즘 불일치(ES256) → `--no-verify-jwt`로 재배포
- GPT-4o-mini + Tavily 연동 동작 확인 완료
- 정확도 개선 필요 (프롬프트 튜닝 / 모델 업그레이드 검토)

## 프로젝트 구조

```
PosterLink (pnpm monorepo)
├── .npmrc                  ← shamefully-hoist=true (React Native 호환)
├── apps/
│   ├── web/                ← Next.js 14 (Vercel 배포: posterlink.kr)
│   │   └── public/logo.png ← 웹 헤더 아이콘
│   └── mobile/             ← Expo SDK 50 (EAS Build)
│       ├── app.json        ← EAS projectId, Supabase config
│       ├── eas.json        ← build profiles (dev/preview/prod)
│       ├── babel.config.js ← babel-preset-expo
│       ├── metro.config.js ← monorepo watchFolders
│       └── App.tsx         ← 카메라 촬영 + 로그인 + 푸시알림
├── supabase/
│   └── functions/
│       ├── process-ocr/    ← GPT-4o Vision OCR + Tavily 링크 검색
│       └── check-deadlines/← 마감 알림 (pg_cron)
└── packages/
    ├── lib/
    ├── types/
    └── ui/
```

## 남은 작업

### 우선순위 중간
- [x] iOS 빌드 설정 정리 (bundle id, EAS profiles, 빌드/제출 스크립트)
- [ ] iOS 실제 클라우드 빌드 및 TestFlight 업로드 (Apple Developer 계정 로그인/인증서 발급 필요)
- [ ] 생체인식 로그인 — 모바일 앱 지문/Face ID (`expo-local-authentication`)
- [ ] 네이버 로그인 실제 구현 (현재 "준비중" placeholder)
- [ ] pg_cron 마감 알림 (`check-deadlines`) 스케줄링 확인

### 우선순위 낮음
- [ ] OCR 정확도 개선 (프롬프트 튜닝 / gpt-4o 모델 전환)
- [ ] 모바일 앱 UI 확장 (포스터 목록, 알림 화면)
- [ ] 포스터 검색/필터 개선 (키워드, 날짜별)
- [ ] Production 빌드 & 스토어 배포 (Google Play / App Store)

## 참고 정보

- Supabase project ref: `zxndgzsfrgwahwsdbjdj`
- 배포 URL: https://www.posterlink.kr (Vercel)
- EAS owner: `maxmini`
- Kakao Client ID: `4f7e06ba59933885126fffd9bc629fcc`
- Edge Functions 배포: `npx supabase functions deploy <name> --no-verify-jwt --project-ref zxndgzsfrgwahwsdbjdj`

## 2026-08-12 모바일/iOS 정리

- 모바일 워크스페이스 이름을 루트 스크립트와 맞춰 `@posterlink/mobile`로 정리했다.
- iOS 빌드/제출 스크립트:
  - `pnpm --dir apps/mobile ios:simulator`
  - `pnpm --dir apps/mobile build:ios:preview`
  - `pnpm --dir apps/mobile build:ios:production`
  - `pnpm --dir apps/mobile submit:ios`
- iOS `buildNumber`를 `9`로 올리고, 카메라·사진·Face ID 권한 문구를 명시적으로 유지했다.
- 포스터 촬영은 사진만 사용하므로 `expo-camera` 마이크 권한과 Android 녹음 권한을 제거했다.
- EAS 원격 설치에서도 `expo-device` Xcode 26 패치가 실행되도록 루트 `postinstall`을 추가했다.
- App Store/TestFlight 빌드에서 `expo-dev-client`/`expo-dev-menu`가 포함되지 않도록 제거했다.
- 실제 iOS 빌드 전 확인:
  - Apple Developer Program 활성 계정
  - App Store Connect 앱 `6769311952` 접근 권한
  - Supabase OAuth redirect URL에 `com.maxmini.posterlink://auth-callback` 및 Expo 개발 리디렉션 등록
  - TestFlight 내부 테스트 그룹 준비

### iOS 빌드 결과

- iOS simulator/development 빌드 성공:
  - https://expo.dev/accounts/maxmini/projects/posterlink-mobile/builds/efca4206-92d4-4fe2-8273-f10373038be3
- iOS production 빌드 성공:
  - EAS build ID: `8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2`
  - IPA: https://expo.dev/artifacts/eas/bWx-rcph4K68oVLd7eim_T0aq1FqcXkR09nblyXzQyY.ipa
- iOS preview/internal distribution 빌드는 EAS remote iOS credentials가 없어 비대화 모드에서 중단됐다.
  - Apple Developer 계정으로 `pnpm --dir apps/mobile build:ios:preview`를 대화형으로 실행해 내부 배포용 인증서를 한 번 구성해야 한다.
- App Store Connect 제출은 EAS Submit까지 예약됐으나 App Store Connect API Key가 `com.maxmini.posterlink` 앱을 찾을 권한이 없어 실패했다.
  - 실패 submission: `54514071-e1b2-4ba0-b9cd-36d326266931`
  - 해결: App Store Connect에서 앱 접근 권한이 있는 API Key를 EAS credentials에 다시 등록하거나 `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`로 제공한다.

### 재개 포인터

- 상세 인수인계는 `WORK_LOG_20260812_mobile_ios_app.md`의 `이어서 작업하기` 섹션을 기준으로 한다.
- 제출 재시도 전에는 App Store Connect API Key 권한만 먼저 해결한다. production IPA는 이미 생성되어 있으며, 같은 빌드를 다시 제출할 수 있다.
- API Key 해결 후 우선 실행:
  - `pnpm --dir apps/mobile exec eas submit --platform ios --profile production --id 8f8b7d2a-3ea4-48d3-b2d2-2ae90237b2e2 --non-interactive`
