# 09. 바이브 코딩용 구현 순서 및 프롬프트 가이드

## 1. 권장 기술 스택

### 가장 빠른 MVP 조합
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- PostgreSQL
- Supabase Auth / Storage / DB (또는 별도 API)
- React Query or Server Actions
- Zod validation

### 이유
- 사용자 앱 + 운영자 도구 + 관리자 CMS를 단일 코드베이스로 빠르게 구축 가능
- 모바일 우선 웹/PWA로 바로 검증 가능
- 인증/스토리지/DB 구성이 빠름

## 2. 개발 순서

### Step 1. 프로젝트 스캐폴드
구현 항목:
- Next.js 프로젝트 생성
- TypeScript
- Tailwind
- ESLint/Prettier
- env 구조
- 기본 라우트 그룹

권장 라우트 예시:
- `/`
- `/login`
- `/onboarding`
- `/explore`
- `/posters/[id]`
- `/favorites`
- `/notifications`
- `/mypage`
- `/operator`
- `/operator/posters/new`
- `/admin`
- `/admin/posters`
- `/admin/reports`

---

### Step 2. DB 스키마 생성
`05_data_model.md` 기준으로 아래부터 생성
1. users / profiles
2. categories / regions / eligibility_tags
3. posters / poster_images / poster_links
4. poster_favorites
5. comments / comment_reports
6. notifications
7. admin_actions

---

### Step 3. 기준정보 시딩
초기 seed 예시
- 카테고리 8~10개
- 지역(전국, 시도, 시군구 최소 구조)
- 연령/조건 태그
- 신고 사유 코드

---

### Step 4. 사용자 핵심 화면
먼저 구현:
1. 온보딩/관심조건 설정
2. 홈
3. 탐색
4. 포스터 상세
5. 찜 목록

이 순서로 작업해야 초기 데모가 빠르게 가능

---

### Step 5. 포스터 CRUD
구현 범위:
- 관리자/운영자용 생성
- 목록/상세 조회
- 수정
- 상태 변경
- 마감 처리

---

### Step 6. 댓글/신고
구현 범위:
- 댓글/대댓글 작성
- 신고 등록
- 관리자 숨김/삭제

---

### Step 7. 추천 로직
초기에는 SQL + 서버 로직으로 구현
- 지역 매칭
- 연령 매칭
- 카테고리 매칭
- 마감 임박 가중치

복잡한 AI 추천은 보류

---

### Step 8. 운영자 등록도구
- 이미지 업로드
- 보정본 확인 UI
- OCR 결과 입력 UI
- 링크 등록
- 게시 미리보기

---

### Step 9. 관리자 CMS
- 포스터 관리
- 댓글/신고 관리
- 기준정보 관리

## 3. 바이브 코딩 프롬프트 작성 규칙

### 좋은 프롬프트 예시
- 한 번에 한 화면 또는 한 도메인만 요청
- 입력/출력/상태값을 명시
- “파일 분리 방식”까지 지정
- 더미 데이터 구조를 함께 요구

### 예시 1
“Next.js App Router + TypeScript + Tailwind 기준으로 공공 포스터 앱의 홈 화면을 만들어줘. 상단에 지역/관심 카테고리 요약, 검색창, 추천순/마감임박순/최신순 탭, 포스터 카드 리스트가 필요하다. 카드에는 썸네일, 제목, 기관명, 마감일, 태그, 찜 버튼이 들어가야 한다. 컴포넌트는 `PosterCard`, `HomeHeader`, `SortTabs`로 분리해줘.”

### 예시 2
“PostgreSQL 기준으로 posters, poster_links, poster_regions, poster_eligibility_tags 테이블 생성 SQL을 작성해줘. 상태값 enum과 인덱스도 포함해줘.”

### 예시 3
“포스터 상세 페이지를 만들어줘. 공식 링크와 참고 링크를 시각적으로 구분하고, 댓글 영역 위에 ‘정확한 신청 자격 및 절차는 공식 공고를 반드시 확인하세요’ 안내문을 고정 배치해줘.”

## 4. AI에게 넘길 때 같이 주면 좋은 제약 조건

- 모바일 우선 UI
- 공공서비스 느낌의 과도하지 않은 디자인
- 텍스트 가독성 우선
- 상태값은 enum 수준으로 명확히
- 관리자/운영자 권한 분리
- 공식 정보/사용자 의견 분리
- 댓글은 일반 커뮤니티보다 정제된 톤

## 5. 추천 폴더 구조 예시

```txt
src/
  app/
    (public)/
      page.tsx
      explore/page.tsx
      posters/[id]/page.tsx
      favorites/page.tsx
      notifications/page.tsx
      mypage/page.tsx
    (auth)/
      login/page.tsx
      onboarding/page.tsx
    (operator)/
      operator/page.tsx
      operator/posters/new/page.tsx
    (admin)/
      admin/page.tsx
      admin/posters/page.tsx
      admin/reports/page.tsx
  components/
    posters/
    comments/
    favorites/
    filters/
    layout/
    admin/
    operator/
  lib/
    auth/
    db/
    utils/
    recommendation/
  types/
  hooks/
```

## 6. 1차 개발 완료 후 다음 작업

- Seed 데이터 정리
- 실데이터 입력 테스트
- 운영자 등록 시간 측정
- 추천 결과 검증
- 댓글 운영 정책 테스트
- 마감 상태 자동 처리 배치

## 7. 가장 먼저 AI에게 시킬 작업 우선순위

1. DB 스키마 생성
2. 시드 데이터 생성
3. 포스터 목록/상세 UI
4. 온보딩/관심조건 저장
5. 찜 기능
6. 댓글/신고
7. 운영자 등록화면
8. 관리자 신고 처리 화면
