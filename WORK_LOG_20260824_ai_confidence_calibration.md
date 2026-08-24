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

## Operational Update

- User approved applying the updated field evidence rows.
- Before apply:
  - `deadline_date` confidence distribution: 0.42=63, 0.55=4, 0.60=120, 0.75=187, 0.90=23.
  - `deadline_type` confidence distribution: 0.48=128, 0.80=93.
- Ran:
  - `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-confidence-fix-apply.json --apply`
- Apply result:
  - Checked posters: 550.
  - Evidence rows applied: 3,295.
  - Failed chunks: 0.
- Verified on the linked remote project:
  - `deadline_date` confidence distribution: 0.42=21, 0.55=4, 0.60=160, 0.75=187, 1.00=25.
  - `deadline_type` confidence distribution: 0.90=221.
- Re-ran Phase 3 tier dry-run:
  - `pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-after-confidence-fix-dryrun.json`
  - Checked posters: 550.
  - Evidence rows read: 3,553.
  - Tier distribution: A 6 / B 0 / C 544.
  - Gate distribution: SEO 264 / calendar 21 / deadline alert 21 / recommendation 0.
