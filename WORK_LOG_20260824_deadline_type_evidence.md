# 2026-08-24 Deadline Type Evidence Backfill

## Context

- `compute-exposure-tiers` dry-run still reported many `critical_missing_deadline_type` blockers.
- Existing `posters.deadline_type` values use `fixed`, `ongoing`, `until_exhausted`, `scheduled`, and `unknown`.
- This change avoids turning missing or ambiguous recruitment periods into always-open deadlines.

## Changes

- Added `scripts/crawler/src/deadline-type-evidence.js`.
- Added rule-based `deadline-type-rule-v2` evidence generation for missing or `unknown` `deadline_type`.
- Rules only generate evidence when explicit source text supports:
  - `fixed`: application/recruitment context plus date and deadline/range wording.
  - `ongoing`: explicit always-open wording such as always/sometimes open recruitment.
  - `until_exhausted`: explicit exhausted-budget/capacity or first-come deadline wording.
- Integrated the rule into `scripts/crawler/src/backfill-field-evidence.js`.
- Added focused tests in `scripts/crawler/src/deadline-type-evidence.test.js`.

## Safety

- Existing non-`unknown` deadline types are not changed.
- Ambiguous event dates without application/recruitment context do not create evidence.
- DB writes still require a separate `--apply` run after operator approval.

## Grounded Deadline Date Follow-up

Added a narrow fallback to infer `deadline_type=fixed` from high-confidence
`deadline-date-grounded-v1` evidence when the evidence text itself contains a
Korean period label and application cue.

This is intentionally limited to grounded date evidence and does not promote
standalone event/travel periods.

Verification:

- `node --test scripts/crawler/src/deadline-date-evidence.test.js scripts/crawler/src/deadline-type-evidence.test.js`
  - Passed: 18 tests.
- `pnpm --filter posterlink-crawler test`
  - Passed: 192 tests.
- Dry-run:
  `data/results/grounded-period-deadline-evidence-safe-13-dryrun.json`
  - Candidate rows: 13
  - `deadline_date`: 12
  - `deadline_type`: 1
  - Not applied to the operating DB.

## Grounded Period Safe 13 Evidence Apply

Applied after explicit user approval:

- Approved phrase:
  `grounded-period deadline evidence safe 13 rows operating DB apply approved.`
- Original approval:
  `grounded-period deadline evidence safe 13건 운영 DB 적용 승인합니다.`
- Applied deadline type rows: 1
- Extractor: `deadline-type-from-date-evidence-v1`
- Value: `fixed`
- Confidence: 0.90

Post-apply tier dry-run:

- Checked rows: 546
- `critical_missing_deadline_type`: 267
- calendar/deadlineAlert gate: 126

The post-apply scope included four additional review rows that were not present
in the earlier safe-13 dry-run baseline.
