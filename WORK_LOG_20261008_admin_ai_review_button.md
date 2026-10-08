# 2026-10-08 관리자 AI 검토 승인 버튼

## 목표

- 관리자 검수대기 목록에서 현재 대기 항목을 AI가 다시 읽고 안전한 항목만 승인하는 백그라운드 작업을 실행한다.
- 날짜·카테고리·중복·포스터 여부가 불확실한 항목은 자동 승인하지 않고 검수대기에 남긴다.

## 구현

- `/admin/posters` 검수대기 탭 상단에 `AI 검토 승인` 버튼과 실행 상태를 추가했다.
- `/api/admin/posters/ai-review`에서 관리자 권한을 재검증하고 `AI Review Queue` GitHub Actions를 실행한다.
- 확인 토큰, 500건 상한, 동시 실행 차단, 관리자 작업 로그를 적용했다.
- 정밀 실행에서는 다음 순서로 처리한다.
  1. 검수대기 대표 이미지를 캐시 없이 다시 판독한다.
  2. 품질 게이트가 확정한 비포스터를 제외한다.
  3. GPT-5를 5건 단위로 실행해 날짜·카테고리를 검토한다.
  4. 높은 신뢰도, 우려 사항 없음, 위험 날짜·중복 신호 없음 조건을 모두 통과한 항목만 승인한다.
- 화면은 15초마다 실행 상태를 갱신하고 완료 후 검수대기 목록을 다시 불러온다.

## 운영 설정

- 웹 서버에 `GITHUB_ACTIONS_TOKEN`이 필요하다.
- 필요 시 `GITHUB_AI_REVIEW_REPOSITORY`, `GITHUB_AI_REVIEW_WORKFLOW_ID`, `GITHUB_AI_REVIEW_REF`를 설정한다.
- GitHub 저장소 변수 `OPENAI_REVIEW_QUEUE_THOROUGH_MODEL`이 없으면 정밀 검토 모델은 `gpt-5`를 사용한다.

## 검증

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --dir apps/web exec playwright test e2e/authenticated/admin/review.spec.ts --project=admin`
  - 11 passed, 1 skipped
- 비인증 API 조회: HTTP 403
- Playwright 시각 검증
  - 데스크톱: 1440×1000
  - 모바일: 390×844
- `git diff --check`
