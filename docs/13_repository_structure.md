# 포스터링크 리포지토리 구조 제안

## 1. 기본 원칙

바이브코딩 기준에서는 프로젝트가 너무 잘게 쪼개져 있으면 오히려 생산성이 떨어진다.
따라서 초기에는 **모노레포** 구조를 사용하고, 앱과 공통 패키지를 명확히 분리하는 것이 좋다.

## 2. 권장 디렉터리 구조

```text
posterlink/
  apps/
    web/                  # 사용자 웹 + 운영자/관리자 웹
    mobile/               # Expo 운영자 촬영 앱
    worker/               # OCR/이미지처리/배치 (선택)
  packages/
    ui/                   # 공통 UI 컴포넌트
    types/                # 공통 타입
    lib/                  # 공통 유틸, 도메인 함수
    config/               # eslint, tsconfig, prettier 설정
  supabase/
    migrations/           # SQL 마이그레이션
    policies/             # RLS 정책 문서/스크립트
    seed/                 # 초기 데이터
    functions/            # Edge Functions 사용 시
  docs/
    product/
    architecture/
    prompt/
```

## 3. 앱별 역할

### apps/web
하나의 코드베이스 안에서 아래를 모두 운영한다.

- 사용자 서비스
- 운영자 등록도구
- 관리자 CMS
- 랜딩페이지

추천 라우트 예시:

```text
/app
  /(public)
    /
    /search
    /posters/[id]
    /login
    /mypage
    /favorites
  /(operator)
    /operator/uploads
    /operator/review
    /operator/posters/new
  /(admin)
    /admin/posters
    /admin/comments
    /admin/reports
    /admin/settings
```

### apps/mobile
운영자 전용 모바일 앱이다.

핵심 기능:
- 포스터 촬영
- 이미지 보정 전 미리보기
- 업로드
- 임시 메모/위치 태깅
- 검수 요청

### apps/worker
초기에는 비워둘 수 있다.

추후 아래 작업이 들어오면 추가한다.
- OCR 후처리
- 이미지 원근 보정
- 링크 후보 추천
- 추천 점수 재계산
- 신고/댓글 자동 필터링

## 4. packages 구성

### packages/ui
- 버튼
- 카드
- 배지
- 필터칩
- 모달
- 폼 컴포넌트
- 관리자 테이블 컴포넌트

### packages/types
- Poster
- PosterLink
- UserProfile
- Comment
- ModerationStatus
- ApiResponse

### packages/lib
- 추천 점수 계산 유틸
- 날짜 계산 유틸
- 포스터 상태 판정 함수
- 권한 체크 헬퍼
- 공통 포맷터

### packages/config
- ESLint
- TypeScript base config
- Prettier
- Tailwind preset

## 5. docs 폴더 운영

문서는 코드와 함께 관리한다.

추천 하위 구조:

```text
docs/
  product/
  architecture/
  prompt/
  api/
  sql/
```

## 6. 브랜치 전략 초안

초기에는 단순하게 간다.

- `main`: 배포 가능한 상태
- `develop`: 통합 개발 브랜치
- `feature/*`: 기능 단위 브랜치

예시:
- `feature/poster-list`
- `feature/favorites`
- `feature/operator-upload`
- `feature/admin-moderation`

## 7. 네이밍 규칙

### 폴더/파일
- kebab-case 사용

### 컴포넌트
- PascalCase 사용

### DB 컬럼
- snake_case 사용

### API 응답 키
- 프론트/백엔드 규칙을 통일해 snake_case 또는 camelCase 중 하나를 선택
- Supabase SQL 중심이면 snake_case가 더 자연스럽다.

## 8. 초기 구현 우선순위에 맞는 최소 구조

MVP를 빠르게 시작하려면 아래 정도만 먼저 있어도 된다.

```text
posterlink/
  apps/
    web/
    mobile/
  packages/
    ui/
    types/
  supabase/
    migrations/
    seed/
  docs/
```

## 9. 결론

초기에는 **web + mobile + supabase** 중심의 가벼운 모노레포로 시작하고,
AI/OCR/추천 고도화가 필요해질 때 worker를 추가하는 것이 가장 현실적이다.
