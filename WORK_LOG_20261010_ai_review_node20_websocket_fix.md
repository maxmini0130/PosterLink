# 2026-10-10 AI 검토 승인 Node.js 20 호환성 수정

## 장애

- 운영 관리자 화면의 `AI 검토 승인` 실행이 GitHub Actions run `37951501206`에서 실패했다.
- `Re-read review queue poster images` 단계가 Supabase 클라이언트를 생성하면서 중단됐다.
- 원인은 GitHub Actions의 Node.js 20 환경에 네이티브 `WebSocket`이 없고, 최신 Supabase Realtime 클라이언트가 이를 요구한 것이다.
- 실패는 첫 번째 데이터 처리 전에 발생했으므로 운영 DB 변경은 없었다.

## 수정

- 크롤러 공통 환경 로더가 네이티브 `WebSocket`이 없는 Node.js에서만 설치된 `ws` 구현을 `globalThis.WebSocket`에 연결하도록 했다.
- 네이티브 구현이 있는 Node.js 22 이상에서는 기존 구현을 유지한다.
- Node.js 20 호환 동작을 고정하는 회귀 테스트를 추가했다.

## 검증

- `node --test src/load-env.test.js`
- `npx -y node@20.20.2 -e "import('./src/load-env.js').then(() => { if (typeof globalThis.WebSocket !== 'function') process.exit(1); console.log('NODE20_WEBSOCKET_OK'); })"`
- `pnpm --filter posterlink-crawler test`
  - 319 passed, 0 failed
- Node.js 20.20.2에서 검수대기 1건 이미지 재판독 `dry-run`
  - candidate 1건, applied 0건, failed 0건

## 운영 확인

- 커밋 `ec44366`을 `origin/main`에 반영했다.
- 쓰기 없는 GitHub Actions 점검 run `37952112896`을 Node.js 20.20.2에서 실행했다.
  - 이미지 재판독, 비포스터 제외, AI 검토, 보고서 업로드 단계가 모두 성공했다.
- 기존 관리자 요청과 동일한 59건을 `thorough=true`, `apply=true`로 다시 실행했다.
  - GitHub Actions run `37952289649` 성공
  - 이미지 재판독: 59건 처리, 실패 0건
  - 비포스터 제외: 1건
  - AI 본문·날짜·카테고리 검토: 58건
  - 공개 승인: 22건
  - 마감 처리: 3건
  - 낮은 신뢰도 또는 추가 확인 필요로 검수대기 유지: 33건
  - 카테고리 변경 판정: 10건
  - 날짜 변경 판정: 49건
- 최종 운영 DB 상태를 다시 조회했다.
  - 검수대기: 33건
  - 공개 조회: 292건
  - `count_public_posters`와 `search_public_posters` 결과가 모두 292건으로 일치했다.
