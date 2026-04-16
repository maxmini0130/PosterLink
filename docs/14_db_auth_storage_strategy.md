# 포스터링크 DB / 인증 / 스토리지 전략

## 1. 기본 방향

이 서비스는 포스터 자체보다도 **구조화된 메타데이터와 권한 관리**가 중요하다.
따라서 DB, 인증, 스토리지 전략은 아래 기준으로 설계한다.

- 포스터/댓글/찜/신고를 안정적으로 저장할 것
- 역할별 접근 제어가 명확할 것
- 이미지 원본/보정본을 분리 저장할 것
- 추후 추천/검색 확장이 가능할 것

## 2. DB 선택

### 추천
**PostgreSQL (Supabase Postgres)**

### 이유
- 공공 포스터 데이터는 관계형 구조가 많다.
- 지역, 대상, 조건, 카테고리 같은 다중 필터링이 중요하다.
- 댓글, 대댓글, 신고, 찜, 검수이력까지 함께 다뤄야 한다.
- 추후 `pgvector`로 의미 기반 추천까지 확장할 수 있다.

## 3. 핵심 테이블 그룹

### 사용자 계층
- `users`
- `profiles`
- `user_interest_categories`
- `user_interest_regions`
- `user_conditions`

### 포스터 계층
- `posters`
- `poster_images`
- `poster_links`
- `poster_categories`
- `poster_regions`
- `poster_target_rules`
- `poster_tags`

### 활동 계층
- `favorites`
- `comments`
- `comment_reports`
- `poster_views`

### 운영 계층
- `operator_uploads`
- `ocr_results`
- `poster_review_logs`
- `moderation_logs`

## 4. 인증 전략

### 추천
**Supabase Auth**

### 역할(Role)
- `guest`
- `user`
- `operator`
- `admin`

### 역할별 권한
#### guest
- 공개 포스터 열람
- 일부 검색/필터
- 로그인 유도

#### user
- 찜하기
- 댓글 작성
- 신고하기
- 개인화 추천 사용

#### operator
- 포스터 업로드
- OCR 결과 검수
- 링크 연결
- 검수 요청

#### admin
- 포스터 승인/반려
- 댓글 숨김/삭제
- 신고 처리
- 금칙어 관리
- 정책/카테고리 관리

## 5. 권한 제어

### 추천
**RLS(Row Level Security) 활성화**

RLS를 적극 사용해 아래를 통제한다.

- 일반 사용자는 본인 데이터만 수정 가능
- 운영자는 본인이 등록한 초안만 수정 가능
- 관리자는 모든 검수/신고/정책 데이터 접근 가능
- 공개 포스터만 사용자에게 노출

## 6. 스토리지 전략

### 추천
**Supabase Storage**

### 버킷 예시
- `poster-originals`
- `poster-processed`
- `poster-thumbnails`
- `comment-attachments`
- `admin-private`

### 저장 원칙
- 원본 이미지와 보정본 이미지를 분리 저장한다.
- 사용자 노출용 썸네일을 별도 관리한다.
- 민감하거나 내부 검수용 파일은 private 버킷에 둔다.

## 7. 이미지 업로드 흐름

1. 운영자가 모바일 앱에서 포스터 촬영
2. 앱에서 1차 크롭/리사이즈
3. 원본 이미지 업로드
4. 보정본 생성 또는 후처리 요청
5. DB에 메타데이터 저장
6. 승인 후 공개용 썸네일/이미지 노출

## 8. 추천/검색 확장 전략

### 1차
- 지역 일치
- 연령대 일치
- 카테고리 일치
- 대상 조건 일치
- 마감일 임박
- 등록일 최신

위 기준으로 SQL 점수화를 먼저 구현한다.

### 2차
- `pgvector` 추가
- 유사 포스터 추천
- 찜한 공고 기반 추천
- OCR 텍스트 기반 의미 검색

## 9. 백업과 로그

초기라도 아래 로그는 반드시 남겨야 한다.

- 포스터 생성/수정/승인 이력
- 댓글 삭제/숨김 이력
- 신고 처리 이력
- 운영자 작업 로그

공공정보 특성상 운영 이력 추적이 중요하므로, 실제 삭제보다 상태 변경 + 로그 기록 방식을 우선 검토한다.

## 10. 결론

이 프로젝트의 데이터 계층은 단순 콘텐츠 저장소가 아니라,
**포스터 메타데이터 + 사용자 조건 + 운영 이력 + 권한 제어**를 함께 다루는 구조여야 한다.

따라서 초기 최적 조합은:

**Supabase Postgres + Auth + Storage + RLS**

이다.
