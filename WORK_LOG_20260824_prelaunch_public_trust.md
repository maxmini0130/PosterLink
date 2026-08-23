# 2026-08-24 출시 전 공개 신뢰성 보강

## 목적

- 공개 공고 목록에서 “접수 중” 기준을 실제 신청 가능 상태와 일치시킨다.
- 공개 상세에서 내부 검수 상태가 사용자에게 노출되지 않게 한다.
- 홈, 사이트맵, 검색 로그, 공개 카드의 출시 전 신뢰성 문제를 보완한다.
- 현재 PosterLink 기능과 남은 개선 과제를 가이드 형태로 정리한다.

## 변경

- `apps/web/lib/posterApplication.ts`
  - 신청 가능 여부 판정 함수 `isPosterAcceptingApplications`를 추가했다.
  - 마감일 없음, 시작일만 있음, 날짜 오류, 시작 전 공고를 접수 중으로 보지 않게 했다.
- `/posters`
  - 직접 조회, RPC 조회, semantic search 결과에 동일한 신청 가능 필터를 적용했다.
  - 같은 검색어를 다시 제출해도 검색 로그가 남도록 보정했다.
- 공개 카드와 상세
  - `PosterCard`가 시작일과 마감 유형을 받아 같은 상태 계산을 사용하도록 했다.
  - 공개 공고 상세에서 내부 검수 상태 블록을 제거하고 공개용 정보 확인 문구로 바꿨다.
- 홈과 요약 API
  - 홈 초기 HTML에 핵심 문구와 검색 링크가 나오도록 전체 화면 스피너 의존을 제거했다.
  - 신청 가능한 공고 수와 피드 필터에 같은 날짜 기준을 적용했다.
- 사이트맵
  - 포스터, 지역, 카테고리, 지역-카테고리, 기관 상세 URL이 포함되도록 보강했다.
- DB
  - `supabase/migrations/20260824010000_fix_public_active_poster_filtering.sql` 마이그레이션 파일을 추가했다.
  - 사용자 승인 후 `pnpm dlx supabase db push --linked`로 운영 DB에 적용했다.
- 문서
  - `docs/posterlink_feature_guide_20260824.md`를 추가했다.
  - `docs/google_play_launch_readiness.md`에 2026-08-24 모바일 출시 준비 재검증 결과를 추가했다.

## 검증

- `pnpm test`
- `pnpm --filter web exec tsc --noEmit --pretty false`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm dlx supabase db push --linked`
- `pnpm dlx supabase db lint --linked`
- `pnpm --dir apps/mobile typecheck`
- `pnpm --dir apps/mobile check:play-readiness`
- `pnpm --dir apps/mobile exec expo config --type public`
- 로컬 `next start` 후 확인
  - `/` 초기 HTML에 홈 H1과 `/posters` 검색 진입 링크 포함
  - `/sitemap.xml`에 포스터, 지역, 카테고리, 지역-카테고리, 기관 상세 URL 포함
  - `/api/home/summary` 정상 JSON 응답

## 남은 작업

- Google Play Console 개발자 계정 신원 확인과 연락처 인증은 계정 소유자가 진행해야 한다.
- 모바일 실제 기기 테스트, OAuth callback, 알림 토큰 저장 확인이 남아 있다.
