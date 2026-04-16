# 포스터링크 기술 아키텍처 제안

## 1. 목표

이 프로젝트의 기술 구조는 아래 3가지를 동시에 만족해야 한다.

1. 빠르게 MVP를 출시할 수 있어야 한다.
2. 운영자 수집/검수/관리 흐름까지 함께 담을 수 있어야 한다.
3. 추후 이미지 처리, 추천, 검색 기능을 확장할 수 있어야 한다.

따라서 초기에는 과도한 마이크로서비스 구조보다 **모놀리식 중심 + 확장 가능한 분리 구조**를 채택한다.

## 2. 권장 스택 요약

### 프론트엔드
- 사용자 웹 / 운영자 웹 / 관리자 웹: **Next.js + TypeScript + Tailwind + shadcn/ui**
- 현장 촬영용 모바일 앱: **Expo(React Native)**

### 백엔드
- 1차 MVP: **Next.js Route Handlers + Server Actions**
- 무거운 작업 분리: **Python FastAPI 워커** 또는 **Supabase Edge Functions**

### 데이터 계층
- DB: **PostgreSQL (Supabase Postgres)**
- 인증: **Supabase Auth**
- 파일 저장: **Supabase Storage**
- 권한 제어: **RLS(Row Level Security)**

### 검색 / 추천
- 1차: **PostgreSQL 필터링 + 정렬 + 규칙 기반 점수화**
- 2차: **pgvector 기반 유사도 추천 및 의미 검색**

## 3. 전체 구조

```text
[사용자 웹 / 운영자 웹 / 관리자 웹]  ->  Next.js
[현장 촬영 모바일 앱]                ->  Expo React Native
                                      
                ->  Next.js API / Server Actions
                ->  Supabase Auth
                ->  Supabase Postgres
                ->  Supabase Storage
                ->  Worker(FastAPI or Edge Functions)
```

## 4. 구성 이유

### Next.js를 메인 웹으로 쓰는 이유
- 사용자용 서비스와 운영자/관리자 화면을 하나의 코드베이스에서 빠르게 개발할 수 있다.
- SEO 대응, 랜딩페이지, 검색/상세 페이지 구성에 유리하다.
- Route Handlers를 API 계층처럼 쓸 수 있어 MVP 개발 속도가 빠르다.

### Expo를 모바일 운영앱으로 쓰는 이유
- 현장 촬영, 업로드, 이미지 조작 흐름 구현이 빠르다.
- 운영자 전용 앱으로 먼저 배포하고 운영 효율을 검증하기 좋다.
- 사용자용 앱은 나중에 필요 시 확장하고, 초기에는 사용자 웹으로도 충분하다.

### Supabase를 쓰는 이유
- Postgres, Auth, Storage, RLS를 한 번에 가져갈 수 있다.
- 초기 인프라 구성 부담을 크게 줄여 준다.
- 추후 SQL 기반 정교한 필터링과 벡터 검색 확장에 유리하다.

## 5. 서비스별 역할

### 사용자 웹
- 맞춤 추천 피드
- 검색/필터
- 포스터 상세
- 찜 목록
- 댓글/질문/후기
- 마이페이지

### 운영자 앱/웹
- 포스터 촬영
- 이미지 업로드
- OCR 결과 확인
- 공식 링크 연결
- 검수 요청

### 관리자 웹
- 포스터 승인/반려
- 댓글 신고 처리
- 금칙어 관리
- 사용자 제재
- 카테고리/지역/정책 관리

## 6. 백엔드 역할 분리

### Next.js가 담당하는 것
- 화면 렌더링
- 사용자 API
- 인증 후 페이지 접근 제어
- 포스터/댓글/찜 CRUD
- 운영/관리자 기본 기능

### 워커가 담당하는 것
- 이미지 원근 보정
- OCR 후처리
- 링크 후보 자동 추천
- 추천 점수 재계산 배치
- 댓글 자동 필터링

## 7. 왜 초기에 별도 대형 백엔드를 두지 않는가

이 프로젝트는 초기에 가장 중요한 것이:
- 사용자 수보다는 운영 생산성
- 화려한 AI보다는 정확한 등록/분류
- 기술적 복잡도보다 출시 속도

따라서 초기부터 NestJS, Spring Boot, 마이크로서비스, 메시지큐를 과하게 도입하는 것은 오버엔지니어링일 가능성이 높다.

## 8. 단계별 분리 원칙

### 1단계
- Web + API + DB를 단순하게 묶는다.
- 핵심 기능 위주로 서비스 구조를 고정한다.

### 2단계
- 이미지 처리와 OCR 후처리를 워커로 분리한다.
- 추천 로직을 SQL + 배치 중심으로 고도화한다.

### 3단계
- 검색/추천이 복잡해지면 pgvector, 캐시, 큐 등을 추가 검토한다.
- 기관 직접 등록 기능, 사용자 제보 기능까지 확장한다.

## 9. 최종 권장안

### 초기 MVP
- Web: Next.js
- Mobile: Expo
- DB/Auth/Storage: Supabase
- API: Next.js Route Handlers

### 확장 단계
- Worker: Python FastAPI
- Search: pgvector
- Batch/Queue: 필요 시 도입

## 10. 핵심 결론

이 프로젝트의 최적 해법은:

**Next.js + Supabase를 중심으로 빠르게 MVP를 만들고, 운영자용 촬영 앱은 Expo로 붙이며, 무거운 처리만 나중에 워커로 분리하는 구조**

이다.
