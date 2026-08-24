# 2026-08-24 Non-fixed deadline tier gate

## Context

After applying `deadline-date-grounded-v1`, 263 posters still had
`critical_missing_deadline_date` in the exposure tier dry-run. A sample showed
that some of those posters already had high-confidence non-fixed deadline type
evidence, such as `ongoing` or `until_exhausted`.

For those posters, inventing a fixed deadline date would be unsafe. The tier
logic should require `deadline_date` only when the deadline type is fixed or
when the deadline type itself is missing/low confidence.

## Change

- Updated `computeTier` to build required critical fields dynamically.
- `deadline_date` remains critical when:
  - `deadline_type` is missing or below threshold.
  - `deadline_type` is fixed/date/deadline-like.
- `deadline_date` is not required for high-confidence non-fixed deadline types.
- Deadline alert and calendar gates remain fixed-date only.

## Verification

- `pnpm --filter posterlink-crawler test`
  - 184 tests passed.
- `pnpm --filter posterlink-crawler tier:compute -- --limit=5000 "--statuses=published,review" --output=data/results/tier-after-nonfixed-deadline-gate-dryrun.json`
  - A: 83
  - B: 1
  - C: 466
  - SEO gate: 459
  - calendar/deadlineAlert gate: 93
  - `critical_missing_deadline_date`: 263 -> 220

## Notes

This change does not write to the operating database. Applying the refreshed
`exposure_tier` / `tier_reason` values to production still requires explicit
approval.
