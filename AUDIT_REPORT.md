# PosterLink Audit Report
> 작성일: 2026-04-18
> 작성자: Claude Opus 4.6 (코드 감사)
> 대상: PosterLink 모노레포 전체 (Gemini 기반 초기 구현물)

---

## 1. 감사 범위

Gemini가 생성한 PosterLink 프로젝트의 전체 코드를 대상으로:
- DB 마이그레이션 무결성
- 프론트엔드 코드와 스키마 간 정합성
- 임포트 경로 정확성
- 타입 정의 동기화
- 모바일 앱 코드 검증

총 **18개 웹 페이지**, **2개 레이아웃**, **4개 공유 컴포넌트**, **2개 Edge Function**,
**4개 마이그레이션**, **시드 데이터**, **모바일 앱** 전수 조사 완료.

---

## 2. 완료된 수정 사항

### Commit 1: `4df6348` — 핵심 스키마/코드 불일치 수정

#### P0 (CRITICAL) — 앱 실행 불가 수준

| # | 파일 | 문제 | 수정 |
|---|------|------|------|
| 1 | `supabase/migrations/` (7개 파일) | 마이그레이션 실행 순서 깨짐. 테이블 생성 전에 해당 테이블을 참조하는 마이그레이션이 먼저 실행됨 → `supabase db reset` 불가 | 7개를 1개(`20260417000000_consolidated_schema.sql`)로 통합. 18개 테이블, 인덱스, RLS 정책, 4개 RPC 함수, 트리거 포함 |
| 2 | `packages/ui/index.ts` | `BaseButton = () => null` 내보내기 → 4개 페이지의 `<Button>` 컴포넌트가 아무것도 렌더링하지 않음 | `React.forwardRef` 기반 실제 Button 컴포넌트 구현 |
| 3 | `apps/web/app/admin/posters/page.tsx` | 5곳에서 스키마와 불일치: `status` → `poster_status`, `review_requested` → `review`, JOIN 경로, 이미지 컬럼명 | 전부 수정 |

#### P1 (HIGH) — 핵심 기능 미작동

| # | 파일 | 문제 | 수정 |
|---|------|------|------|
| 4 | `apps/web/app/onboarding/page.tsx` | 관심 카테고리 저장 코드 전체 주석 처리됨, `age_band` 프로필 업데이트 누락 → 개인화 추천 데이터 없음 | 주석 해제 + `age_band` 추가 |
| 5 | `apps/web/app/operator/posters/new/page.tsx` | `posters` 테이블에 존재하지 않는 `category_id` 컬럼 직접 삽입 시도 (M:N 관계인데 직접 삽입) | 해당 컬럼 INSERT에서 제거 (junction table INSERT는 이미 정상) |
| 6 | `apps/web/app/admin/reports/page.tsx` | FK 힌트명 오류, `status` → `report_status`, dismiss 로직 누락 | 전부 수정 |

#### P2 (MEDIUM) — 부분 오류

| # | 파일 | 문제 | 수정 |
|---|------|------|------|
| 7 | `apps/mobile/App.tsx` | `className` 사용 (React Native에서 미작동), `fontBold` (잘못된 스타일 속성) | `style={{}}` 및 `fontWeight: 'bold'`로 수정 |
| 8 | `packages/types/index.ts` | `PosterStatus`에 `rejected` 누락, 존재하지 않는 `category_id` 필드, `CommentStatus`/`ReportStatus` 타입 없음 | 스키마와 동기화 |

---

### Commit 2: `7861012` — 임포트 경로 전면 수정

| # | 파일 | 문제 | 수정 |
|---|------|------|------|
| 9 | `app/lib/supabase.ts` (신규) | 18개 페이지 중 11개가 `app/lib/supabase`를 참조하지만 파일이 없음 (`web/lib/supabase.ts`에만 존재) | 재내보내기 파일 생성 → 11개 페이지 전부 해결 |
| 10 | `mypage/page.tsx` | Header/BottomNav 경로 `./components/` → `mypage/components/` (존재하지 않음) | `../components/`로 수정 |
| 11 | `mypage/edit/page.tsx` | `../../app/components/` → `app/app/components/` (존재하지 않음) | `../../components/`로 수정 |
| 12 | `mypage/comments/page.tsx` | 동일 | 동일 수정 |
| 13 | `notifications/page.tsx` | `./components/` → `notifications/components/` (존재하지 않음) | `../components/`로 수정 |
| 14 | `favorites/page.tsx` | 컴포넌트가 구버전 `web/components/` 참조 | `../components/`로 수정 |
| 15 | `operator/posters/new/page.tsx` | ImageCropper 경로가 `operator/components/`로 해석됨 (존재하지 않음) | `../../../components/ImageCropper`로 수정 |
| 16 | `operator/layout.tsx` | supabase 경로 `../../../` → `apps/lib/supabase` (한 단계 초과) | `../../lib/supabase`로 수정 |
| 17 | `components/BottomNav.tsx` | 탐색 링크가 `/explore` (해당 페이지 없음) | `/posters`로 수정 |
| 18 | `web/components/` (3파일 삭제) | 구버전 스텁 (아이콘 없음, 다크모드 없음)이 `app/components/`와 중복 → 잘못된 임포트 시 구버전 로드 | 삭제 |

---

## 3. 확인 완료 (수정 불필요)

| 파일 | 확인 결과 |
|------|-----------|
| `apps/web/app/page.tsx` (홈) | 개인화 RPC 호출, JOIN 경로, fallback 로직 모두 정상 |
| `apps/web/app/posters/page.tsx` | 동의어 검색 RPC, 검색 로그, 정렬 로직 정상 |
| `apps/web/app/posters/[id]/page.tsx` | 상세 페이지 쿼리 정상 |
| `apps/web/app/admin/page.tsx` | 대시보드 통계 쿼리 (`poster_status`, `report_status`) 정상 |
| `apps/web/app/admin/settings/page.tsx` | 카테고리/지역 CRUD 정상 |
| `apps/web/app/operator/posters/page.tsx` | 포스터 목록 조회, 검수 요청 로직 정상 |
| `apps/web/app/login/page.tsx` | 이메일/소셜 로그인 정상 |
| `apps/web/app/signup/page.tsx` | 회원가입 + 초기 프로필 생성 정상 |
| `apps/web/app/auth/callback/route.ts` | OAuth 콜백 라우트 존재 확인 |
| `supabase/seed.sql` | 통합 스키마와 호환 확인 |
| `apps/web/lib/supabase.ts` | 클라이언트 싱글톤, env 변수 폴백 처리 정상 |

---

## 4. 미수정 이슈 (향후 작업 필요)

### 4-1. 중간 우선도

| # | 파일 | 이슈 | 설명 |
|---|------|------|------|
| A | `admin/notifications/page.tsx` | Edge Function 테스트 파라미터 불일치 | `check-deadlines` 함수를 테스트 호출할 때 `targetUserId`, `testMode` 등 함수가 지원하지 않는 파라미터를 전달. 함수는 cron용으로 파라미터 없이 동작하도록 설계됨 |
| B | `signup/page.tsx` | profile insert 시 `role` 미설정 | 회원가입 직후 `{ id, nickname }` 만 삽입하여 `role`이 null. onboarding에서 `role: 'user'`로 설정하므로 정상 플로우에서는 동작하지만, onboarding을 건너뛰면 role이 null인 상태로 남음 |
| C | `apps/web/app/components/CommentSection.tsx` | 댓글 기능 검증 미완료 | 파일 존재 확인 및 supabase import 경로 확인만 완료. 댓글 CRUD 로직, 신고 기능, 대댓글 구조의 상세 검증은 미진행 |

### 4-2. 낮은 우선도

| # | 영역 | 이슈 | 설명 |
|---|------|------|------|
| D | 모바일 앱 | `expo-camera` 패키지 deprecated | Expo SDK 50+에서 `Camera` → `CameraView` 마이그레이션 필요. 현재 코드는 이전 API 사용 |
| E | 환경변수 | `.env.local` 비표준 키 포맷 | Supabase anon key가 `sb_publishable_...` 형태 (표준은 `eyJ...` JWT 토큰). 프로젝트 설정 확인 필요 |
| F | 아키텍처 | SSR/CSR 클라이언트 분리 | 모든 페이지가 `"use client"` 사용. 향후 서버 컴포넌트 도입 시 `createServerClient`와 `createBrowserClient` 분리 필요 |
| G | 보안 | RLS 정책 실환경 테스트 | 통합 마이그레이션에 RLS 정책을 작성했으나, 실제 Supabase 인스턴스에서의 동작 검증 필요 |
| H | `web/lib/dummy.ts` | 사용되지 않는 더미 데이터 파일 | 플레이스홀더 데이터만 포함. 어디서도 import하지 않으므로 정리 가능 |

---

## 5. 향후 작업 로드맵 (권장 순서)

### Phase 1: 안정화 (즉시)
1. `supabase db reset` 실행하여 통합 마이그레이션 정상 동작 확인
2. `pnpm dev` (웹) 실행하여 빌드 오류 없는지 확인
3. 각 페이지 수동 동작 테스트 (로그인 → 온보딩 → 홈 → 상세 → 찜 → 마이페이지)
4. 관리자 플로우 테스트 (포스터 검수, 신고 관리, 기준정보)
5. 운영자 플로우 테스트 (포스터 등록 → OCR → 검수 요청)

### Phase 2: 기능 보완
1. 위 미수정 이슈 A~C 처리
2. CommentSection 댓글/신고 기능 상세 검증 및 수정
3. 알림 시스템 (Edge Function + Expo Push) 실기기 테스트
4. 검색 동의어 사전(`synonym_dictionary`) 초기 데이터 투입

### Phase 3: 품질 개선
1. expo-camera → CameraView 마이그레이션
2. SSR/CSR Supabase 클라이언트 분리 검토
3. 에러 바운더리 및 로딩 상태 일관성 개선
4. Supabase RLS 정책 실환경 보안 테스트
5. `.env` 키 포맷 정상화 및 환경별 설정 분리

### Phase 4: 배포 준비
1. `docs/17_service_launch_checklist.md` 기반 런칭 체크리스트 이행
2. Vercel/Supabase 프로덕션 환경 구성
3. CI/CD 파이프라인 구축 (GitHub Actions)
4. 모니터링 및 에러 트래킹 (Sentry 등) 설정

---

## 6. 프로젝트 구조 요약

```
PosterLink/
├── apps/
│   ├── web/                          # Next.js (App Router)
│   │   ├── app/
│   │   │   ├── components/           # 공유 컴포넌트 (Header, BottomNav, PosterCard, CommentSection, ImageCropper)
│   │   │   ├── lib/supabase.ts       # 재내보내기 (→ web/lib/supabase.ts)
│   │   │   ├── page.tsx              # 홈 (개인화 피드)
│   │   │   ├── posters/              # 탐색 + 상세
│   │   │   ├── favorites/            # 찜 목록
│   │   │   ├── mypage/               # 마이페이지 + 프로필수정 + 내댓글
│   │   │   ├── notifications/        # 알림 센터
│   │   │   ├── login/ & signup/      # 인증
│   │   │   ├── onboarding/           # 초기 설정 (지역/연령/관심)
│   │   │   ├── admin/                # 관리자 (대시보드/검수/신고/설정/알림테스트)
│   │   │   └── operator/             # 운영자 (포스터 관리/등록)
│   │   └── lib/supabase.ts           # Supabase 클라이언트 (원본)
│   └── mobile/                       # Expo (운영자 촬영 앱)
├── packages/
│   ├── types/                        # 공유 타입 (UserRole, PosterStatus, Comment 등)
│   ├── ui/                           # 공유 UI (Button)
│   └── lib/                          # 공유 유틸리티
├── supabase/
│   ├── migrations/                   # 통합 스키마 (18 테이블 + RLS + RPC)
│   ├── functions/                    # Edge Functions (process-ocr, check-deadlines)
│   └── seed.sql                      # 초기 데이터
└── docs/                             # 설계 문서
```

---

## 7. 핵심 기술 스택 참고

| 영역 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | Next.js 14 (App Router) | 전체 `"use client"` CSR |
| 모바일 | Expo (React Native) | 운영자 전용 촬영 앱 |
| 백엔드 | Supabase (PostgreSQL + Auth + Storage) | RLS 기반 보안 |
| 서버리스 | Supabase Edge Functions (Deno) | OCR, 마감알림 |
| 개인화 | `get_personalized_feed` RPC | 지역/연령/관심 기반 점수 매칭 |
| 검색 | `search_posters_with_synonyms` RPC | 동의어 확장 + tsvector |
| 스타일링 | Tailwind CSS + 다크모드 | `dark:` 클래스 지원 |
| 애니메이션 | Framer Motion | 홈/온보딩 트랜지션 |
