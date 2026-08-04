# PosterLink

공공 기회를 발견하고, 내용을 판단하고, 실제 신청까지 이어 주는 **포스터링크** 모노레포입니다. 공공기관 공고와 포스터를 수집해 원문 근거와 함께 구조화하며, AI 검증과 사람 검수를 통해 데이터 품질을 관리합니다.

## 구조

- `apps/web`: 사용자·운영자·관리자 웹 (Next.js, 포트 4000)
- `apps/mobile`: 운영자 촬영·업로드 앱 (Expo)
- `packages/ui`: 공통 UI 컴포넌트
- `packages/types`: 공통 타입 정의
- `packages/lib`: 공통 유틸리티 및 비즈니스 로직
- `scripts/crawler`: 공공기관 수집, AI 검증, 데이터 감사·복구 도구
- `supabase/migrations`: Supabase DB 마이그레이션 파일
- `docs`: 제품, 데이터 모델, 아키텍처, 운영 설계 문서
- `WORK_LOG*.md`: 날짜·주제별 작업과 검증 이력

## 시작하기

```bash
# Node.js 20과 pnpm 10을 준비한 뒤 의존성 설치
pnpm install

# 웹 개발 서버 (http://localhost:4000)
pnpm --filter web dev

# 모바일 개발 서버
pnpm --dir apps/mobile start

# 크롤러 사이트 목록과 dry-run
pnpm --filter posterlink-crawler list
pnpm --filter posterlink-crawler crawl:dry
```

## 환경변수

루트 `.env.example`과 `scripts/crawler/.env.example`을 기준으로 로컬 환경 파일을 구성합니다. 실제 키나 서비스 역할 키는 문서, 로그, 커밋에 남기지 않습니다.

- 웹: Supabase 공개 URL·키, 앱 URL, OAuth, Sentry 설정
- 크롤러: Supabase 서버 설정, OpenAI 모델·검증 임계값, 수집 옵션
- 운영 환경: GitHub Actions Secrets와 Vercel Environment Variables에서 관리

## 검증

```bash
# 루트 회귀 테스트
pnpm test

# 웹 lint와 production build
pnpm --filter web lint
pnpm --filter web build

# 크롤러 전체 회귀 테스트와 AI 품질 게이트
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler ai:healthcheck

# 모바일 TypeScript 검사
pnpm --dir apps/mobile typecheck

# Playwright E2E
pnpm --dir apps/web test:e2e
```

AI 품질 게이트와 운영 데이터를 읽는 검사는 필요한 환경변수가 설정되어 있어야 합니다. UI 변경은 주요 모바일·데스크톱 화면도 확인합니다.

## 데이터베이스

- 모든 스키마, 함수, 인덱스, RLS 변경은 새 `supabase/migrations/*.sql` 파일로 기록합니다.
- 이미 적용된 마이그레이션은 수정하지 않습니다.
- 운영 DB 적용과 대량 데이터 수정·복구는 SQL 또는 스크립트, 대상 건수, 검증 쿼리, 롤백 절차를 먼저 준비한 뒤 승인된 절차로 실행합니다.
- 로컬 DB 초기화에는 Supabase CLI와 `supabase/config.toml`, `supabase/seed.sql`을 사용합니다.

## 주요 경로

- 사용자 홈: `/`
- 공고 목록·상세: `/posters`, `/posters/[id]`
- 공고 등록 요청: `/posters/request`
- 운영자 도구: `/operator`, `/operator/posters`
- 관리자 홈: `/admin`
- 공고·검수: `/admin/posters`, `/admin/notice-candidates`
- 수집 운영: `/admin/collection-sources`, `/admin/crawler`
- 방문·운영 현황: `/admin/traffic`

관리자와 운영자 경로는 서버에서 역할을 확인하며, 테스트용 화면이나 목업 데이터로 실제 권한을 대체하지 않습니다.

## 배포와 운영

- 웹은 `apps/web/vercel.json`을 기준으로 Vercel에 배포합니다.
- CI는 웹 lint·build와 크롤러 회귀 테스트를 실행합니다.
- 일일 크롤러는 `.github/workflows/crawler.yml`에서 배치 실행 후 Supabase 업로드와 AI 품질 게이트를 수행합니다.
- 배포·워크플로 실패 시 GitHub Actions와 Vercel 로그를 확인하고, 데이터 쓰기 여부와 재실행 범위를 먼저 판단합니다.

## 개발 규칙

Claude Code는 `CLAUDE.md`, Codex와 다른 코딩 에이전트는 `AGENTS.md`를 먼저 읽어야 합니다. 두 파일은 데이터 정확성, 포스터 AI 검증, DB·RLS 안전, 테스트, 문서와 작업 로그 기준을 공유합니다.

## 기술 스택

- **Frontend**: Next.js 14 (App Router), Expo 51 (React Native)
- **Styling**: Tailwind CSS
- **Backend/DB**: Supabase (Auth, Storage, Postgres)
- **AI/Data**: OpenAI 기반 필드·이미지 검증, 로컬 CLIP, OCR, pgvector
- **Monorepo**: pnpm Workspaces 10
