# 2026-09-12 review queue AI approval

## Scope

운영자가 검수대기 항목을 AI가 직접 읽고 날짜와 카테고리를 확인한 뒤 이상 없으면 승인하라고 요청했다.
현재 환경에는 `OPENAI_API_KEY`가 없어 OpenAI API 배치 검토는 실행하지 못했고, Codex가 운영 DB의 저장 원문,
readable facts, 공식 링크, 기존 AI 이슈를 직접 읽어 승인/보류 계획을 만들었다.

## Input State

- Branch: `feat/ai-verification-phase-1`
- Start command: `git fetch origin`, `git status --short --branch`
- Review queue query: `poster_status = review`
- Input count: 81
- Raw snapshot: `data/results/current-review-queue-20260912.json`

## Applied Work

- New apply script:
  - `scripts/crawler/src/apply-review-queue-approval-20260912.js`
- Dry-run report:
  - `data/results/review-queue-approval-20260912-dryrun.json`
- Apply report:
  - `data/results/review-queue-approval-20260912-apply.json`
- Applied:
  - `published`: 73
  - `closed`: 5
  - kept in `review`: 3
- The script only updated the reviewed poster IDs.
- Exposure tier recomputation was not run.

## Date And Category Corrections

- Separated application/recruitment deadlines from event/class/program dates.
- Corrected stale `2023-09-*` year extractions to the 2026 source context where the notice text supported it.
- Corrected application start dates that had been stored as deadlines, including:
  - 2026 서울시 청년 마음건강 지원사업 4차 추가모집: deadline is 2026-09-15, not the 2026-09-10 start.
  - 2026 서울영테크 공모전: deadline is 2026-10-11, not the 2026-09-07 start.
- Preserved unknown/ongoing deadlines when the source did not state a clear final date.
- Reclassified broad `지원금/복지` or old `문화/행사` assignments into the current operational category set, mainly:
  - `CAT_EVENT_RECRUIT`
  - `CAT_COURSE`
  - `CAT_BUSINESS`
  - `CAT_SUPPORT_PROGRAM`
  - `CAT_RECRUITMENT`
  - `CAT_CONTEST`
  - `CAT_HEALTH`
  - `CAT_LIFE_INFO`
- Corrected two weak titles:
  - `(사)한국능률협회` -> `한국능률협회 <D-Bridge 미디어 커리어 빌드업> 참여자 모집`
  - `성동청소년문화의집 모집` -> `성동청소년문화의집 <우리 가족 쿠킹클래스> 참여자 모집`

## Kept In Review

Three items were not approved because they were not safe to publish automatically:

- `0816e7c6-bb6f-4cf4-bc8c-dbcc29666af9`
  - `DDM 청년창업센터 유니콘 <제 9차 DDM 벤처스타트업 아카데미> 안내`
  - Reason: same-event duplicate candidate. The K-Startup record was preferred for approval.
- `b8513929-5175-4fdd-abdf-027e06987d68`
  - `DDM 청년창업센터 유니콘 <제 9차 DDM 벤처스타트업 아카데미> 안내`
  - Reason: same-event duplicate candidate. The K-Startup record was preferred for approval.
- `5761b95b-5e4d-47df-8f5a-2206da01fca4`
  - `2026년 하반기 환경보안관 추가채용 모집 공고(2개월)`
  - Reason: stored text lacked application deadline, target, and enough official notice facts to verify dates/categories safely.

## Verification

- `pnpm exec node --check scripts/crawler/src/apply-review-queue-approval-20260912.js`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260912.js --output=data/results/review-queue-approval-20260912-dryrun.json`
  - planned: 78
  - kept review: 3
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260912.js --apply --confirm=APPLY_REVIEW_QUEUE_APPROVAL_20260912 --output=data/results/review-queue-approval-20260912-apply.json`
  - applied: 78
- Final status counts:
  - `published`: 559
  - `review`: 3
  - `closed`: 1985
  - `rejected`: 56
- `pnpm --filter posterlink-crawler audit:public-counts`
  - `count_public_posters`: 261
  - `search_public_posters_returned`: 261
  - `search_matches_count`: true
- `pnpm exec node scripts/crawler/src/audit-date-period-mapping.js --output=data/eval/reports/date-period-mapping-audit-20260912.json`
  - audited: 562
  - stale warning: 7
  - mismatch: 10
  - missing clear deadline: 0
  - actionable: 17
  - Several flags are expected heuristic conflicts where the audit prefers an event/class end date over the manually verified application deadline.
- `git diff --check`

## Remaining Work

- Manually resolve the two DDM academy duplicate candidates against the approved K-Startup record.
- Manually inspect the environment security guard recruitment notice or attachment for accurate application period, target, and organizer before approval.
