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
- [ ] iOS 빌드 (Apple Developer 계정 필요)
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
