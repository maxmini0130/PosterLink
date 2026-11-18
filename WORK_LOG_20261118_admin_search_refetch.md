# 2026-11-18 관리자 포스터 검수 화면 '조회' 버튼 재조회 수정

## 문제

관리자 포스터 검수 화면(`/admin/posters`)에서 검수대기 18건을 연 채로 두었다. 그사이 터미널 스크립트로 18건을 모두 승인한 뒤 '조회'를 눌렀지만 목록이 바뀌지 않았다.

## 원인

목록은 `appliedFilters`, `currentFilter`, `page`가 바뀔 때만 다시 불러오도록 되어 있었다. '조회' 버튼(`applySearchFilters`)은 `setPage(0)`과 `setAppliedFilters(draftFilters)`만 실행한다. 그래서 조건을 바꾸지 않았거나 이미 1페이지에 있으면 상태가 그대로라 아무 요청도 나가지 않았다. '초기화' 버튼도 같은 구조다.

## 변경

- `apps/web/app/admin/posters/page.tsx`
  - `searchRequestId` 상태를 추가했다.
  - '조회'와 '초기화'를 누를 때마다 값을 1 올리고, 목록 조회 effect의 의존성에 넣었다.
  - 이제 조건이 그대로여도 버튼을 누를 때마다 목록과 건수(`totalCount`)를 다시 불러온다.

## 검증

- `pnpm --filter web lint` 통과
- `pnpm --filter web build` 통과
- Playwright 확인은 하지 못했다.
  - E2E 관리자 테스트 계정의 운영 `profiles.role`이 현재 `user`라서, 미들웨어가 `/admin`을 `/`로 돌려보낸다.
  - 권한 변경은 운영 DB 쓰기라 하지 않았다.
  - PR 미리보기 사이트에서 관리자 계정으로 확인해야 한다.

## 남은 작업

- E2E 관리자 계정 권한 복구 여부 결정(사용자 승인 필요). 이 계정으로는 관리자 E2E 테스트가 동작하지 않는다.
