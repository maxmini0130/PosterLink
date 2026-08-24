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
