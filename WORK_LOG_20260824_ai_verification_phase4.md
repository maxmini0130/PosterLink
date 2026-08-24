# 2026-08-24 AI Verification Phase 4

## Scope

- Implemented the first Phase 4 poster-detection foundation.
- Added cheap image/text signal extraction and `is_real_poster` evidence candidate generation.
- Did not apply the generated evidence rows to the operating database.

## Changes

- Added `scripts/crawler/src/poster-detection-signals.js`.
  - Computes aspect ratio, megapixels, OCR/source text density, title overlap,
    date/contact tokens, and existing classifier signals.
  - Deterministically rejects tiny images, wide banners, and very low text-density
    images when no classifier positive exists.
  - Deterministically accepts high-confidence existing image-classifier positives
    and strong rule-signal combinations.
  - Routes ambiguous cases to `needs_vlm`.
- Added `scripts/crawler/src/poster-detection-signals.test.js`.
  - Covers signal extraction, immediate rejects, accepts, ambiguous routing, and
    evidence row construction.
- Added `scripts/crawler/src/backfill-poster-detection-evidence.js`.
  - Dry-run-first script that creates `poster_field_evidence.is_real_poster`
    candidate rows.
  - `--apply` upserts only evidence rows and does not alter `poster_status` or
    `exposure_tier`.
- Added root and crawler commands:
  - `pnpm poster-detection:backfill`
- Added `docs/ai_poster_detection.md`.

## Verification

- `pnpm --filter posterlink-crawler test`
  - Passed: 162 tests.
- `pnpm poster-detection:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/poster-detection-evidence-phase4-dryrun.json`
  - Mode: dry-run.
  - Checked posters: 550.
  - Evidence candidates: 258.
  - `is_real_poster=true`: 258.
  - `is_real_poster=false`: 0.
  - Ambiguous / needs VLM: 292.
  - Applied rows: 0.
- `git diff --check`
  - Passed; only Windows line-ending warnings.

## Notes

- The dry-run intentionally creates no negative `is_real_poster` evidence from
  weak signals. Negative writes should wait for Phase 2 labels and stronger
  Phase 4 golden-set measurements.
- Applying the 258 positive evidence rows would unblock a second Phase 3
  `tier:compute` dry-run, but operating DB writes require explicit approval.

