# 2026-09-28 검수대기 AI 검토 및 승인

## 작업 내용

- 운영 DB의 포스터 검수대기 38건을 `scripts/crawler/src/review-current-queue-with-ai.js`로 AI 직접 검토했다.
- 검토 기준은 원문/저장 본문 근거, 신청·모집 마감일과 행사일 분리, `Asia/Seoul` 기준 현재일, 사용자 관점의 대표 카테고리였다.
- 자동 승인 조건은 기존 스크립트 기준을 따랐다: 승인 판정, 신뢰도 0.85 이상, concern 없음, 기존 날짜·중복 차단 이슈 없음, 카테고리 매핑 가능.

## 반영 결과

- 검수대기 총 38건 중 10건을 반영했다.
- 공개 처리: 9건
- 종료 처리: 1건
- 보류: 28건
- 보류 사유는 주로 `date-without-year`, `ambiguous-multiple-dates`, `open-ended-application-period`, 낮은 신뢰도 또는 원문 연도 확인 필요였다.
- 반영 리포트: `scripts/crawler/data/results/review-queue-ai-review-20260928.json`

## 대표 확인 사항

- 모집기간과 행사기간을 분리해, 행사일만 명확한 공개 행사는 행사일을 사용자 노출 기준일로 사용했다.
- 모집 마감 또는 행사일이 2026-09-28 기준 이미 지난 1건은 `closed`로 처리했다.
- 카테고리는 기관명 키워드보다 사용자가 받는 혜택과 참여 행동을 우선해 재지정했다.
- 기존 차단 이슈가 남은 항목은 AI가 긍정 판정했더라도 공개하지 않았다.

## 검증

- `node --check scripts/crawler/src/review-current-queue-with-ai.js`
- `pnpm --filter posterlink-crawler test`
  - 318건 통과
- `pnpm --filter posterlink-crawler audit:public-counts`
  - 공개 검색 카운트 226건과 RPC 반환 226건 일치
  - 최종 상태: `published` 519건, `review` 28건, `closed` 2209건
