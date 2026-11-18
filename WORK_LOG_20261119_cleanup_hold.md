# 2026-11-19 검수 대기 자동 정리: 반려 대신 보류

## 문제

사용자가 반려 목록을 검토한 결과, 반려는 중복일 때만 해야 한다고 정리했다. 그런데 `cleanup-review-nonposters.js`(AI 검수 워크플로의 'Exclude confirmed non-poster images' 단계)는 품질 검사가 reject로 판정한 검수 대기 공고를 곧바로 `rejected`로 바꿨다.

- 운영 반려 81건 중 36건(44%)이 이 자동 정리였다.
  - image-not-poster 13건, weak-summary 11건, news-board-without-action 3건 등
- 실제 공고가 사라진 사례가 있었다(복구 스크립트 `apply-rejected-restore-20261119.js`).
  - 청소년 대관 안내: 요약 부족·시설 안내로 반려
  - 성동구 일자리박람회: 실제 포스터를 AI가 '포스터 아님'으로 판정해 반려
- 자동 반려 경로는 이 스크립트 하나다. AI 검수 대기 처리(`review-current-queue-with-ai.js`)는 승인 또는 대기 유지만 한다.

## 변경

- `scripts/crawler/src/review-cleanup-hold.js`(신규)
  - `withReviewCleanupHold`: 품질 문제를 `field_verification.qualityIssues`에 합친다(관리자 검수 화면에 경고로 보인다).
    - `qualityGateHold`(rules `review-cleanup-hold-20261119`, previousStatus `review`)를 남긴다.
    - 다른 규칙의 보류가 이미 있으면 그 기록은 그대로 둔다.
  - `hasSameCleanupHold`: 같은 판정이면 다시 쓰지 않는다.
- `scripts/crawler/src/cleanup-review-nonposters.js`
  - 상태를 바꾸지 않고 보류만 기록한다(`poster_status`, `rejection_reason`을 쓰지 않음).
  - 보고서에 `hold_count`, `held_count`를 추가했다.
- `.github/workflows/ai-review-queue.yml`: 단계 이름을 'Hold quality-gate reject candidates for a person'으로 바꿨다.
- 보류된 공고는 `hasActiveQualityGateHold` 때문에 AI가 자동 승인하지 않는다. 사람이 공개하면(`published_at > heldAt`) 풀린다.

## 검증

- 새 테스트 4개
  - 반려 대신 보류되는지
  - 자동 승인이 차단되는지
  - 사람이 공개하면 보류가 풀리는지
  - 같은 판정은 다시 쓰지 않는지
  - 다른 보류 기록은 보존되는지
- `pnpm --filter posterlink-crawler test` 444/444 통과
- 운영 dry-run(`--apply` 없음): 현재 검수 대기 0건이라 보류 대상도 0건이다.

## 영향·롤백

- 앞으로 품질 검사 reject 후보는 검수 대기에 남는다. 검수 대기 건수가 늘 수 있다.
- 롤백은 이 커밋을 revert한다.
