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
