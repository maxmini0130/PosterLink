# 2026-09-20 Review Queue AI Approval

## Summary

- Reviewed all 30 current `poster_status = review` rows using source text, poster OCR, official links, publication context, and category definitions.
- Final actions:
  - 28 rows moved to `published`.
  - 2 expired event rows moved to `closed`.
  - 0 rows remain in `review`.

## Date And Category Corrections

- Corrected false 2023 dates to 2026 where the full weekday sequence matched the 2026 calendar and the records were collected from current 2026 notices.
- Separated application deadlines from program/event dates, including the Gwangjin youth entrepreneur event (`9/22` deadline, `9/28` event).
- Applied the per-program `three days before start` rule to the Gwanak October second-batch program; the final `10/28` session closes on `10/25`.
- Kept explicit first-come and ongoing notices as `until_exhausted` or `ongoing` instead of inventing fixed deadlines.
- Reclassified records by their main user benefit: contest, course, health, family, support program, recruitment event, or employment.

## Validation

```bash
pnpm exec node --check scripts/crawler/src/apply-remaining-review-queue-20260920.js
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler audit:public-counts
git diff --check
```

- Crawler tests: 312 passed, 0 failed.
- Public posters: 237.
- Public search results: 237.
- Status counts: `published 536`, `review 0`, `closed 2143`, `rejected 59`.
