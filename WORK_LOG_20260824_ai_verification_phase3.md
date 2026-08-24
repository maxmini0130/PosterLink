# 2026-08-24 AI Verification Phase 3

## Scope

- Implemented the Phase 3 exposure-tier foundation from `docs/AI_VERIFICATION_SPEC.md`.
- Added pure A/B/C tier computation and independent feature gates.
- Added a dry-run-first batch script for reporting tier distribution.
- Did not enable auto-publish and did not update operating DB tier cache columns.

## Changes

- Added `scripts/crawler/src/exposure-tier.js`.
  - `computeTier(input, thresholds)` returns `A`, `B`, or `C`.
  - Gates are computed independently: `seo`, `calendar`, `deadlineAlert`, `recommendation`.
  - Critical fields are `deadline_date`, `deadline_type`, `host_org`, `official_url`, and `is_real_poster`.
  - Thresholds are conservative provisional defaults until Phase 2 has reviewed labels.
- Added `scripts/crawler/src/exposure-tier.test.js`.
  - Covers A/B/C tier boundaries, duplicate/non-recruit blockers, and gate behavior.
- Added `scripts/crawler/src/compute-exposure-tiers.js`.
  - Reads posters and `poster_field_evidence`.
  - Produces A/B/C and gate distribution reports.
  - Defaults to dry-run.
  - `--apply` updates only `posters.exposure_tier`, `tier_computed_at`, and `tier_reason`.
  - It never changes `poster_status`.
- Added `pnpm tier:compute` root command and crawler package command.
- Added `docs/ai_exposure_tiers.md`.

## Verification

- `pnpm --filter posterlink-crawler test`
  - Passed: 156 tests.
- `pnpm --filter posterlink-crawler tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-phase3-dryrun.json`
  - Mode: dry-run.
  - Checked posters: 550.
  - Evidence rows read: 3,295.
  - Tier distribution:
    - A: 0
    - B: 0
    - C: 550
  - Gate distribution:
    - SEO: 264
    - Calendar: 0
    - Deadline alert: 0
    - Recommendation: 0
  - Top blockers:
    - `critical_missing_is_real_poster`: 550
    - `critical_missing_deadline_type`: 329
    - `critical_low_confidence_host_org`: 284
    - `critical_missing_deadline_date`: 277
    - `critical_low_confidence_deadline_date`: 250
    - `critical_low_confidence_deadline_type`: 221

## Notes

- The all-C result is expected because `is_real_poster` is a Phase 4 output and
  does not exist yet in `poster_field_evidence`.
- This keeps auto-publishing closed while still showing which feature gates can
  become active once Phase 2 thresholds and Phase 4 poster detection exist.

