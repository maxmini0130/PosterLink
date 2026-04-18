# PosterLink 웹 작업 로그

## 작업 환경
- 브랜치: `develop`
- 스택: Next.js 14 (App Router), Supabase (PostgreSQL + Auth + Storage + Edge Functions), Tailwind CSS, pnpm 모노레포
- 포트: `http://localhost:4000`
- 실행: `pnpm --filter web dev`

---

## 완료된 작업

### 1. 인프라 / 설정
- pnpm 모노레포 실행 환경 수정 (postcss, tailwind 설정)
- 서비스 포트 3000 → 4000 변경
- `packages/ui/index.ts` → `index.tsx` 변경 (JSX 문법 오류 해결)
- `packages/ui/package.json` main 필드 수정

### 2. DB 마이그레이션
- **`supabase/migrations/20260418000000_delta_schema.sql`** 작성 및 적용
  - 기존 테이블 유지하며 누락 테이블 10개 안전 추가
  - `posters.status` → `posters.poster_status` 컬럼명 변경
  - RPC 함수 3개 생성: `get_recommended_posters`, `search_posters_with_synonyms`, `log_search`
- `supabase/seed.sql` ON CONFLICT DO NOTHING 추가
- `posters.thumbnail_url TEXT` 컬럼 추가 (poster_images 테이블 PostgREST 캐시 문제 우회)

### 3. Supabase RLS 정책 (SQL Editor 수동 적용)
| 테이블 | 정책 |
|--------|------|
| `categories`, `regions` | SELECT 허용 (anon 포함) |
| `profiles` | SELECT / INSERT / UPDATE (auth.uid() = id) |
| `user_interest_categories` | ALL (auth.uid() = user_id) |
| `comments` | SELECT / INSERT / UPDATE |
| `favorites` | ALL (auth.uid() = user_id) |
| `poster_categories`, `poster_regions`, `poster_images`, `poster_links` | SELECT(공개) / INSERT(인증) |
| `posters` | SELECT(공개+본인+관리자) / INSERT(인증) / UPDATE(본인+관리자) |

### 4. Supabase Storage
- `poster-originals` 버킷 생성 (Public ON)
- 인증 사용자 업로드 / 전체 공개 읽기 정책 적용

### 5. Edge Function
- `supabase/functions/process-ocr/index.ts` 배포 (`--no-verify-jwt`)
- 현재 시뮬레이션 데이터 반환 (실제 OCR 미연동)

### 6. 인증 플로우
- **회원가입**: `signUp` 후 `signInWithPassword` 즉시 시도, 프로필 `upsert`
- **온보딩**: `getUser()` 실패 시 `getSession()` → `localStorage` 3단계 폴백
- **OAuth 콜백**: 서버 Route Handler → 클라이언트 컴포넌트 교체 (신규 소셜 유저 온보딩 분기)
- **프로필 수정**: `update` → `upsert` (프로필 없어도 생성)

### 7. 헤더
- 비로그인: 로그인 / 회원가입 버튼 표시
- 로그인: 알림(Bell) / 마이페이지(User) 아이콘
- `onAuthStateChange`로 실시간 상태 반영

### 8. 스키마 불일치 수정
- `poster_status` 컬럼명 전 페이지 통일 (`status` → `poster_status`)
- `poster_status` enum 값 통일 (`review` → `review_requested`)
- `poster_favorites` 테이블명 → `favorites`
- `storage_path` 컬럼 → `image_url`
- `poster_categories/poster_regions` JOIN → `thumbnail_url` 직접 사용 (PostgREST 캐시 문제 우회)

### 9. UI 버그 수정
- 모든 입력창 `text-gray-900 placeholder:text-gray-400` 추가 (시스템 다크모드 글자 안 보임 해결)
- CommentSection textarea 글자색, 500자 초과 차단
- 운영자 포스터 등록: Summary 입력 textarea 추가, OCR 인증 토큰 전달 수정

### 10. 신규 페이지
- `/admin` 대시보드 (검수대기, 게시중, 신고, 사용자 수 통계)
- `/auth/callback` 클라이언트 페이지

---

## 현재 이슈

| # | 내용 |
|---|------|
| I-1 | PostgREST가 `poster_categories`, `poster_regions`, `poster_images` 등 신규 테이블 관계를 인식 못함 → 중첩 JOIN 쿼리 전부 400 오류. `thumbnail_url` 직접 저장으로 우회 중 |
| I-2 | OCR Edge Function이 시뮬레이션 데이터만 반환 (실제 AI 미연동) |
| I-3 | 소셜 로그인(카카오/구글) 미테스트 — Supabase OAuth 앱 설정 필요 |
| I-4 | Header 알림 점이 항상 표시됨 (읽지 않은 알림 없어도) |
| I-5 | 포스터 목록 카테고리/지역 필터 미동작 (중첩 JOIN 제거로 임시 비활성화) |

---

## 할 일

| 순서 | 작업 |
|------|------|
| 1 | **E2E 완료** — 포스터 등록 → 관리자 승인 → 일반 유저 목록/상세 확인 |
| 2 | **PostgREST 스키마 캐시** 해결 — Supabase 대시보드에서 스키마 리로드 또는 인스턴스 재시작 |
| 3 | **카테고리/지역 필터** 복구 — 캐시 해결 후 중첩 JOIN 재적용 |
| 4 | **Header 알림 점** 조건부 표시 수정 |
| 5 | **OCR 실제 연동** — OpenAI Vision API 또는 Google Vision API 연결 |
| 6 | **소셜 로그인** 테스트 — Supabase 대시보드에서 Kakao/Google OAuth 앱 등록 |
| 7 | **`lib/dummy.ts` 정리** — 실제 데이터 나오면 제거 |
| 8 | **모바일(Expo) 앱** 점검 |
| 9 | **`develop` → `main` PR** 생성 |

---

## 역할별 접근 경로

| 역할 | 경로 | 접근 조건 |
|------|------|-----------|
| 일반 유저 | `/`, `/posters`, `/posters/[id]`, `/favorites`, `/mypage` | 누구나 (일부 로그인 필요) |
| 운영자 | `/operator/posters`, `/operator/posters/new` | role = operator 또는 admin |
| 관리자 | `/admin`, `/admin/posters`, `/admin/reports`, `/admin/settings` | role = admin 또는 super_admin |

## role 변경 (SQL Editor)
```sql
UPDATE profiles SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
```
