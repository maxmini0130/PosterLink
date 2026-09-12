# 2026-09-12 DDM academy duplicate resolution

## Scope

운영자가 남은 동일 내용 2건 중 하나는 반려하고 하나는 AI가 정확히 판단해 승인하라고 요청했다.
대상은 검수대기에 남아 있던 DDM 청년창업센터 유니콘 `제 9차 DDM 벤처스타트업 아카데미` 중복 2건이다.

## Decision

Approved representative:

- `b8513929-5175-4fdd-abdf-027e06987d68`
- Reason:
  - 동대문구청 공식 공고 원문이 붙어 있다.
  - 동일 Google Form 신청 링크가 있다.
  - 행사 일시가 2026-09-16으로 확인된다.
  - source/notice provenance가 더 직접적이다.

Rejected duplicate:

- `0816e7c6-bb6f-4cf4-bc8c-dbcc29666af9`
- Reason:
  - 동일 행사, 동일 신청 링크, 동일 행사일의 중복 레코드다.
  - 청년몽땅정보통 경유본이라 대표 원문으로는 동대문구청 원문 레코드보다 약하다.

## Applied Data

Approved row:

- Status: `published`
- Application deadline: 2026-09-16
- Event start/end: 2026-09-16
- Deadline type: `fixed`
- Categories:
  - `CAT_BUSINESS`
  - `CAT_COURSE`

Rejected row:

- Status: `rejected`
- Rejection reason: `중복 반려: b8513929-5175-4fdd-abdf-027e06987d68 대표 승인`
- `field_verification.duplicateResolution.duplicateOf`: `b8513929-5175-4fdd-abdf-027e06987d68`

## Artifacts

- Script: `scripts/crawler/src/apply-ddm-academy-duplicate-resolution-20260912.js`
- Dry-run report: `data/results/ddm-academy-duplicate-resolution-20260912-dryrun.json`
- Apply report: `data/results/ddm-academy-duplicate-resolution-20260912-apply.json`

## Verification

- `pnpm exec node --check scripts/crawler/src/apply-ddm-academy-duplicate-resolution-20260912.js`
- Dry-run:
  - approve: `b8513929-5175-4fdd-abdf-027e06987d68`
  - reject: `0816e7c6-bb6f-4cf4-bc8c-dbcc29666af9`
- Apply:
  - applied: true
- Post-apply DB check:
  - approved row status: `published`
  - rejected row status: `rejected`
  - approved categories: `CAT_BUSINESS`, `CAT_COURSE`
- `pnpm --filter posterlink-crawler audit:public-counts`
  - `count_public_posters`: 263
  - `search_public_posters_returned`: 263
  - `search_matches_count`: true
- `git diff --check`

## Note

At verification time the total review queue was 14 because new crawler rows had arrived. This task only resolved the two DDM duplicate rows requested by the operator.
