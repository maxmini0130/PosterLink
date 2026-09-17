# 2026-09-17 Review Queue AI Automation

## Summary

- Reviewed 42 `poster_status = review` rows using stored source text, readable facts, official links, dates, and categories.
- Published 25 rows and closed 1 row after AI review plus manual verification of date/category decisions.
- Restored 2 rows to review after detecting unresolved deadline/category evidence during the final safety check.
- Remaining review rows: 17.

## Safety Improvements

- Increased the OpenAI review timeout from 90 to 180 seconds for larger review batches.
- Raised the automatic approval threshold from 0.70 to 0.85.
- Automatic approval now requires no unresolved concerns and at least one valid category.
- Added the repository category definitions to the review prompt, including explicit IR competition and expo guidance.
- Added `--input=<report>` support so an inspected dry-run report can be applied without generating different AI decisions.
- Added `--exclude=<id,id>` support for removing individual rows from an inspected plan. Quote this argument in PowerShell because commas are otherwise parsed as an array.

## Corrections

- Restored the following rows to their prior review state after the first apply command did not receive the unquoted PowerShell exclusion list as one argument:
  - `af94feb8-5c12-4b32-82c2-0d89d753fe58`: application deadline was not verified from source evidence.
  - `23e5fc41-c809-4e81-a969-f4465fde2f1f`: representative category still requires correction to education/course.
- The restoration is recorded in `scripts/crawler/src/restore-review-queue-exclusions-20260917.js`.

## Validation

```bash
pnpm exec node --check scripts/crawler/src/review-current-queue-with-ai.js
pnpm exec node --check scripts/crawler/src/restore-review-queue-exclusions-20260917.js
pnpm --filter posterlink-crawler audit:public-counts
git diff --check
```

- Public poster count: 252.
- Public search count: 252.
- Status counts after restoration: `published 548`, `review 17`, `closed 2085`, `rejected 58`.

## Final Queue Resolution

- Re-read and resolved all 17 remaining review rows using source text, poster OCR, weekday/year consistency, official page metadata, and category definitions.
- Final actions:
  - 15 rows published.
  - 1 past 2025 household-waste notice moved to `closed`.
  - 1 secondary copy of the Mapo education-month notice rejected as a duplicate of the canonical Mapo-gu notice.
- Corrected two false 2023 dates to 2026 after verifying every stated weekday against the 2026 calendar:
  - Dongjak single-household employment course.
  - Yeongdeungpo youth dance community.
- Corrected the Gangdong pregnancy/childcare class to the 2026 notice year using the official page publication date (`2026-09-14`) and poster OCR.
- Kept unknown or first-come deadlines as `unknown` or `until_exhausted` rather than inventing fixed dates.
- Final verification:
  - Public posters: 264.
  - Public search results: 264.
  - Status counts: `published 563`, `review 0`, `closed 2086`, `rejected 59`.
