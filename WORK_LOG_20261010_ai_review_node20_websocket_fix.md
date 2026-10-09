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

- 수정 배포 후 GitHub Actions에서 쓰기 없는 점검을 먼저 수행한다.
- 점검 성공 후 기존 관리자 요청과 동일한 조건으로 검수대기 AI 검토를 다시 실행하고 결과를 기록한다.
