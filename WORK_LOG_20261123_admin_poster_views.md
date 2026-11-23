# 2026-11-23 관리자 포스터 조회수 화면

## 문제

관리자가 포스터별로 상세 화면이 몇 번 열렸는지 볼 수 있는 화면이 없었다. 조회 기록(`poster_view_logs`)은 이미 쌓이고 있었지만, 공개 카드 지표 API(`/api/poster-link-clicks`)와 운영자 성과 리포트에서만 일부 사용하고 있었다.

## 결정

- 새 테이블·마이그레이션 없이 기존 `poster_view_logs`, `poster_link_click_logs`를 집계한다.
- 서비스 역할 키를 쓰지 않는다. 서버에서 관리자 역할을 다시 확인한 뒤, 같은 로그인 세션으로 읽어 두 로그 테이블의 관리자 전용 RLS 정책이 그대로 적용되게 한다.
- 기간은 7일 / 30일 / 90일(보관 기간 전체)만 제공한다. 원본 조회 기록은 보존 정책(`usage_log_retention`)에 따라 3개월이 지나면 삭제되므로 "누적 전체 조회수"는 정확히 셀 수 없다. 화면의 "집계 기준과 한계"에 이를 명시했다.
- PostgREST 행 제한으로 집계가 조용히 잘리지 않도록 1,000건씩 페이지로 읽고, 50,000건을 넘으면 `truncated` 경고를 표시한다.

## 변경

- `apps/web/lib/posterViewStats.ts`: 포스터별 조회수, 최근 7일 조회수, 방문자 수(브라우저 키 기준 추정), 링크 클릭, 마지막 조회 시각 집계
- `apps/web/lib/posterViewStats.test.ts`: 집계·정렬·기간 파싱 단위 테스트 (루트 `pnpm test`에 등록)
- `apps/web/app/api/admin/poster-views/route.ts`: 관리자 전용 GET API (`?days=7|30|90`)
- `apps/web/app/admin/poster-views/page.tsx`: 요약 카드 4개, 조회수 순위 표, 제목 검색, 50건씩 더 보기, 포스터 상세 링크(새 탭). 모바일에서는 부가 열 대신 제목 아래 요약 줄로 표시
- `apps/web/app/admin/layout.tsx`: 관리자 메뉴에 "포스터 조회수" 추가

## 집계 기준

- 조회 1회 = 상세 화면 열림 1회. 같은 브라우저에서 30분 안에 같은 포스터를 다시 열면 기록하지 않는다(`logPosterView`).
- 조회 기록에는 사용자·자동 접속 구분이 없어 관리자·운영자 본인 조회와 봇이 포함될 수 있다.
- `visitor_key`가 없는 기록은 각각 별도 방문자로 센다(방문자 수가 과대 추정될 수는 있으나 조회가 누락되지는 않는다).

## 검증

- 운영 DB 읽기 전용 확인: `poster_view_logs` 2,059건(2026-08-23 이후), 최근 30일 1,520건, 포스터 815개
- 로컬 빌드(`next start`, 운영 Supabase 읽기)로 Playwright 확인
  - 비로그인 API 401
  - 관리자 API 30일 합계 1,520~1,522건 — 위 DB 직접 집계와 일치(확인 사이 신규 조회 반영), truncated 없음, 포스터 정보 누락 0
  - 기간 전환, 빈 검색 결과 안내, 메뉴 링크, 데스크톱 1440px·모바일 390px 화면, 모바일 가로 넘침 0px
  - 확인 중 `/api/site-visits`, `/api/poster-views` 요청은 가로채 운영 기록을 남기지 않음
- `pnpm --filter web lint`, `pnpm --filter web build`, `git diff --check` 통과
- `pnpm test`: 407건 중 405 통과, 2건 실패 — `scripts/security/profile-role-release.test.ts`의 과거 릴리스 기준선 비교 테스트로, 변경 전 `origin/main`에서도 같은 2건이 실패한다(이번 변경과 무관).

## 남은 작업

- 3개월 이전까지 포함한 누적 조회수가 필요하면, 보존 삭제 전에 포스터별 일 단위 조회수(개인 식별자 없음)를 남기는 집계 테이블과 보존 작업 수정이 필요하다(마이그레이션·운영 적용 승인 필요).
- 관리자·운영자 본인 조회 제외가 필요하면 조회 기록에 주체 구분을 추가해야 한다.
- 루트 `package.json`의 `test` 스크립트 마지막 항목이 `"favoritesV61.test.ts apps/web/lib/browseRegion.test.ts"`처럼 한 인자로 묶여 있다(이번 변경에서 손대지 않음).
