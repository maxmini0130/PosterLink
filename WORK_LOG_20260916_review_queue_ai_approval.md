# 2026-09-16 Review Queue AI Approval

## Summary

- Synced `feat/ai-verification-phase-1` with `origin` and reviewed the current `poster_status = review` queue.
- Snapshot saved to `data/results/current-review-queue-20260916.json`.
- Reviewed 32 pending rows against stored source text, readable facts, official links, dates, and categories.
- Applied 30 decisions:
  - 29 rows moved to `published`.
  - 1 expired row moved to `closed`.
- Kept 2 rows in `review` because the stored readable text was too weak and the official detail content was effectively image-only, so dates/categories could not be safely verified from text evidence.

## Applied Notes

- Corrected `SEOUL SAFE 2026 Track B 참가팀 모집` title before publishing.
- Closed `종로 청년 프로젝트 워크` because its real application deadline was `2026-09-11`; the stored `2007` value was an age/cutoff detail, not a deadline.
- Cleaned mismatched application links for Dobong/Gangseo rows before publishing.
- Verified public counts after applying:
  - Public posters: 252
  - Search count matched public count.
  - Status counts: `published 547`, `review 2`, `closed 2061`, `rejected 58`

## Remaining Review Rows

- `[교육의 달] '마포를 배우달 미래를 채우달' 교육 프로그램 신청 안내(9.10~)`
- `마포구 교육의 달 '마포를 배우달, 미래를 채우달' 교육 프로그램 신청 안내`

Both rows appear related to the same Mapo education-month program family, but the stored source evidence is not strong enough for automatic approval. Keep them in human/stronger-source review unless OCR or structured source extraction can recover the image-embedded schedule and categories.

## Automation Improvement

- Updated `scripts/crawler/src/review-current-queue-with-ai.js` so the review prompt and stale-date logic use the current `Asia/Seoul` date by default instead of a hard-coded historical date.
- Added `review:current-queue-ai:apply` to `scripts/crawler/package.json`:

```bash
pnpm --filter posterlink-crawler review:current-queue-ai
pnpm --filter posterlink-crawler review:current-queue-ai:apply
```

The automation should continue to approve only rows with clear source evidence. Weak text, image-only schedules, ambiguous dates, and uncertain categories should remain in review.

## Validation

```bash
pnpm exec node --check scripts/crawler/src/apply-review-queue-approval-20260916.js
pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260916.js --output=data/results/review-queue-approval-20260916-dryrun.json
pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260916.js --apply --confirm=APPLY_REVIEW_QUEUE_APPROVAL_20260916 --output=data/results/review-queue-approval-20260916-apply.json
pnpm --filter posterlink-crawler audit:public-counts
pnpm exec node scripts/crawler/src/audit-date-period-mapping.js --output=data/eval/reports/date-period-mapping-audit-20260916.json
```
