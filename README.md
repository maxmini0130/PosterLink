# PosterLink Monorepo

공공 포스터 링크 플랫폼 **포스터링크** 프로젝트입니다.

## 구조

- `apps/web`: 사용자 서비스 및 관리자 웹 (Next.js)
- `apps/mobile`: 운영자 촬영 및 업로드 앱 (Expo)
- `packages/ui`: 공통 UI 컴포넌트
- `packages/types`: 공통 타입 정의
- `packages/lib`: 공통 유틸리티 및 비즈니스 로직
- `supabase/migrations`: Supabase DB 마이그레이션 파일

## 시작하기

```bash
# 의존성 설치
pnpm install

# 모든 앱 실행 (Parallel)
pnpm dev
```

## 기술 스택

- **Frontend**: Next.js (App Router), Expo (React Native)
- **Styling**: Tailwind CSS
- **Backend/DB**: Supabase (Auth, Storage, Postgres)
- **Monorepo**: pnpm Workspaces
