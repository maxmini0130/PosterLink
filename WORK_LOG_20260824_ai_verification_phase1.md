# 2026-08-24 AI Verification Phase 1

## Scope

- Implemented Phase 1 from `docs/AI_VERIFICATION_SPEC.md`.
- Added field-level extraction evidence storage, confidence calibration helpers, OCR evidence output/write path, and a dry-run-first backfill script.
- Did not apply the migration or write backfill rows to the operating database.

## Changes

- Added migration `supabase/migrations/20260824030000_add_poster_field_evidence.sql`.
  - Creates `poster_field_evidence` with field key, value, evidence text/source, extractor, and calibrated confidence.
  - Adds `posters.exposure_tier`, `tier_computed_at`, and `tier_reason` as Phase 3 cache columns.
  - Uses the real lifecycle column `poster_status = 'published'` for public read RLS.
- Added `scripts/crawler/src/field-evidence.js`.
  - Implements `adjustConfidence` with evidence cap, mismatch penalty, regex/corroboration boost, conflict penalty, and human override.
  - Normalizes current structured column names into the Phase 1 field key vocabulary.
- Added `scripts/crawler/src/backfill-field-evidence.js`.
  - Builds evidence rows from existing structured columns, `field_verification.readableNotice`, organization verification, and `poster_links`.
  - Defaults to dry-run; database writes require explicit `--apply`.
- Updated `supabase/functions/process-ocr/index.ts`.
  - Keeps existing response fields.
  - Adds `posterId` as an optional input.
  - Prompts the model to return `fieldEvidence` and `unresolved`.
  - Writes OCR evidence rows to `poster_field_evidence` when `posterId` and service-role env vars are available.
- Updated `docs/AI_VERIFICATION_SPEC.md` with confirmed live schema names and paths.

## Verification

- `pnpm --filter posterlink-crawler test`
  - Passed: 149 tests.
- `pnpm --filter posterlink-crawler evidence:backfill -- --limit=25 --output=data/results/field-evidence-backfill-phase1-dryrun.json`
  - Passed in dry-run mode.
  - Checked 25 posters.
  - Generated 269 evidence rows.
  - Applied 0 rows.
- `git diff --check`
  - Passed; only line-ending warnings for existing Windows checkout behavior.

## Remaining Operational Steps

- Applied the migration to the linked Supabase project after explicit approval.
- Deployed `process-ocr` after the migration existed in the database.
- Ran the full backfill in dry-run mode for all published/review posters and inspected the report.
- Ran backfill with `--apply` after explicit user direction.

## Operational Update

- User approved operating DB migration application.
- Ran `pnpm dlx supabase db push --linked --yes`.
- Applied migration:
  - `20260824030000_add_poster_field_evidence.sql`
- Verified on the linked remote project:
  - `public.poster_field_evidence` exists.
  - `posters.exposure_tier`, `posters.tier_computed_at`, and `posters.tier_reason` exist.
  - `poster_field_evidence_select_public_published` RLS SELECT policy exists.
  - `poster_field_evidence` has 0 rows before backfill.

## Process OCR Deployment And Backfill

- User requested continuing from step 2 through the remaining Phase 1 operational steps.
- Deployed `process-ocr` to the linked Supabase project.
  - Previous version: 11.
  - Deployed version: 12.
- Re-ran crawler tests after deployment.
  - `pnpm --filter posterlink-crawler test`: 149 passed.
- Updated the backfill script to fetch `poster_links` in 200-poster chunks.
  - Reason: full dry-run initially hit Supabase/PostgREST header limits when querying links for all poster IDs in one request.
- Full dry-run:
  - Command: `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-backfill-phase1-full-dryrun.json`
  - Checked posters: 550.
  - Evidence rows planned: 3,295.
  - Failed chunks: 0.
- Applied backfill:
  - Command: `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-backfill-phase1-apply.json --apply`
  - Checked posters: 550.
  - Evidence rows applied: 3,295.
  - Failed chunks: 0.
- Verified on the linked remote project:
  - `poster_field_evidence` row count after backfill: 3,295.
  - Field distribution:
    - `host_org`: 550
    - `official_url`: 549
    - `deadline_date`: 397
    - `target_desc`: 349
    - `venue`: 296
    - `apply_method`: 270
    - `contact`: 261
    - `benefit`: 224
    - `deadline_type`: 221
    - `apply_url`: 178

## High-confidence core P0 evidence apply

Applied after explicit user approval:

- Approved phrase:
  `high-confidence core P0 evidence 16 new rows operating DB apply approved.`
- Original approval:
  `고신뢰 핵심 P0 evidence 신규 16건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/field-evidence-high-core-p0-dryrun.json`
- Applied rows: 16
- Minimum confidence: 0.90
- Fields:
  - `host_org`: 8
  - `deadline_type`: 1
  - `official_url`: 4
  - `deadline_date`: 3

Post-apply DB verification confirmed all 16 selected rows.

Post-apply tier dry-run:

- Checked rows: 542
- A: 167
- B: 3
- C: 372
- SEO gate: 452
- calendar/deadlineAlert gate: 115
- `critical_missing_deadline_type`: 264
- `critical_missing_deadline_date`: 221
- `critical_low_confidence_deadline_date`: 115
- `critical_low_confidence_host_org`: 88

## New Review Gap Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `new-review gap evidence bundle 32 rows operating DB apply approved.`
- Original approval:
  `new-review gap evidence bundle 32건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/new-review-gap-evidence-bundle-dryrun.json`
- Applied rows: 32
- Fields:
  - `is_real_poster`: 6
  - `host_org`: 11
  - `deadline_date`: 3
  - `deadline_type`: 6
  - `official_url`: 6
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 32 selected rows.

Post-apply tier dry-run:

- Checked rows: 550
- A: 179
- B: 3
- C: 368
- SEO gate: 458
- calendar/deadlineAlert gate: 128
- `critical_missing_deadline_type`: 265
- `critical_missing_deadline_date`: 225
- `critical_missing_official_url`: 3
- `critical_missing_host_org`: 2
- `critical_missing_is_real_poster`: 2

Note: two new `review` rows entered the tier scope between the bundle dry-run
and post-apply tier check. They were outside the approved 32-row bundle and
account for the remaining `critical_missing_is_real_poster` and
`critical_missing_host_org` blockers.

## Residual Gap Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `residual gap evidence bundle 25 rows operating DB apply approved.`
- Original approval:
  `residual gap evidence bundle 25건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/residual-gap-evidence-bundle-dryrun.json`
- Applied rows: 25
- Fields:
  - `is_real_poster`: 5
  - `host_org`: 10
  - `official_url`: 4
  - `deadline_date`: 2
  - `deadline_type`: 4
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 25 selected rows.

Post-apply tier dry-run:

- Checked rows: 554
- A: 182
- B: 3
- C: 369
- SEO gate: 462
- calendar/deadlineAlert gate: 130
- `critical_missing_deadline_type`: 265
- `critical_missing_deadline_date`: 225
- `critical_low_confidence_deadline_date`: 105
- `critical_low_confidence_host_org`: 88
- `critical_missing_official_url`: 3

`critical_missing_is_real_poster` and `critical_missing_host_org` were removed
from the top reasons after this bundle, but a new review row entered the tier
scope during the run and accounts for one remaining multi-field gap.

## Post-Residual Critical Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `post-residual critical evidence bundle 37 rows operating DB apply approved.`
- Original approval:
  `post-residual critical evidence bundle 37건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/post-residual-critical-evidence-bundle-dryrun.json`
- Applied rows: 37
- Affected posters: 23
- Fields:
  - `deadline_type`: 23
  - `host_org`: 6
  - `official_url`: 3
  - `is_real_poster`: 3
  - `deadline_date`: 2
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 37 selected rows.

Post-apply tier dry-run:

- Checked rows: 557
- A: 202
- B: 3
- C: 352
- SEO gate: 465
- calendar/deadlineAlert gate: 152
- `critical_missing_deadline_type`: 245
- `critical_missing_deadline_date`: 226
- `critical_low_confidence_deadline_date`: 105
- `critical_low_confidence_host_org`: 88
- `critical_missing_official_url`: 3

The A-tier count increased by 20 and the deadline alert gate increased by 22.
One new row entered the published/review tier scope during the apply window,
so the post-apply checked count is 557 instead of the dry-run's 556.
