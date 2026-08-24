# 2026-08-24 AI Confidence Calibration

## Scope

- Investigated the remaining Phase 3 blockers after applying positive
  `is_real_poster` evidence.
- Improved deterministic confidence calibration for deadline evidence.
- Did not apply updated evidence rows to the operating database.

## Changes

- Updated `scripts/crawler/src/field-evidence.js`.
  - Treats equivalent Korean date expressions as matching ISO date values.
  - Example: `2026-09-01` can match `2026년 9월 1일`.
  - Avoids penalizing deterministic `deadline_type` enum evidence just because
    the enum string is not literally present in the source sentence.
- Updated `scripts/crawler/src/backfill-field-evidence.js`.
  - Raises raw deterministic `deadline_date` confidence from `0.75` to `0.85`
    when no existing deadline mismatch flag is present.
  - Raises explicit non-unknown `deadline_type` confidence from `0.8` to `0.9`.
- Updated `scripts/crawler/src/field-evidence.test.js`.
  - Added coverage for Korean date equivalence and deterministic deadline type
    enum confidence.

## Verification

- `pnpm --filter posterlink-crawler test`
  - Passed: 164 tests.
- `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-confidence-fix-dryrun.json`
  - Mode: dry-run.
  - Checked posters: 550.
  - Evidence rows planned: 3,295.
  - Failed chunks: 0.
- New dry-run confidence pass counts at `>= 0.9`:
  - `deadline_date`: 25
  - `deadline_type`: 221
  - `host_org`: 266

## Notes

- Many `deadline_date` rows remain below the Phase 3 threshold because existing
  `field_verification.deadlineMatches === false` flags intentionally keep them
  conservative. These should not be raised automatically without human labels or
  a more specific deadline reconciliation step.
- Applying the updated evidence rows requires explicit operating DB approval.

