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
- Deploy `process-ocr` after the migration exists in the database.
- Run the full backfill in dry-run mode for all published/review posters and inspect the report.
- Run backfill with `--apply` only after explicit approval.

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
