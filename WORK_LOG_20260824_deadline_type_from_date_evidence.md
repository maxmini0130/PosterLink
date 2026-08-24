# 2026-08-24 Deadline type from date evidence

## Context

After `deadline-date-grounded-v1` and the non-fixed deadline tier adjustment,
`critical_missing_deadline_type` remained one of the largest blockers. A sample
showed that many posters already had high-confidence `deadline_date` evidence
with an explicit application/recruitment period, but no matching `deadline_type`
evidence.

## Change

- Added `deadline-type-from-date-evidence-v1`.
- It infers `deadline_type=fixed` only when a high-confidence deadline date
  evidence row contains the same date inside an explicit application label
  window such as `신청기간`, `접수기간`, `모집기간`, `응모기간`, or `지원기간`.
- It intentionally skips open application periods followed by event/travel
  dates, such as `신청기간: 2026. 8. 24. 10:00~ ... 여행기간: 2026. 9. 5.~9. 6.`.
- It also skips selection/announcement dates after the recruitment window.

## Dry-run result

Command:

```bash
pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/deadline-type-from-date-evidence-dryrun.json
```

Result:

- New `deadline-type-from-date-evidence-v1` candidates: 26
- Confidence bucket: 0.90 x 26
- Total `deadline_type` evidence rows in dry-run: 289

Local tier simulation with the 26 new rows merged into current DB evidence:

- A: 83 -> 97
- B: 1 -> 2
- C: 466 -> 451
- calendar/deadlineAlert gate: 93 -> 119
- `critical_missing_deadline_type`: 287 -> 261

## Verification

- `pnpm --filter posterlink-crawler test`
  - 188 tests passed.

## Production note

No operating DB write has been performed for this extractor yet. Applying the
26 evidence rows to production requires explicit approval.
