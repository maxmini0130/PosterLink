# 2026-08-24 AI Verification Phase 2

## Scope

- Implemented the Phase 2 field-extraction evaluation harness from `docs/AI_VERIFICATION_SPEC.md`.
- Added reviewer seed generation for the 120 human-labeled golden set.
- Did not fabricate human labels or production thresholds.

## Changes

- Added `scripts/crawler/src/extraction-eval.js`.
  - Compares `eval/golden/*.json` truth labels to `poster_field_evidence`.
  - Reports field accuracy, `precision@τ`, `coverage@τ`, hallucination rate, and recommended threshold candidates.
  - Uses `precision@τ >= 0.98` for critical fields and `>= 0.90` for major/minor fields.
- Added `scripts/crawler/src/eval-extraction.js`.
  - CLI for scoring reviewed JSON labels against current DB evidence.
  - Root command: `pnpm eval:extraction`.
- Added `scripts/crawler/src/create-extraction-golden-seed.js`.
  - Generates a reviewer seed file with poster context and current best evidence.
  - Root command: `pnpm eval:sample`.
- Added `scripts/crawler/src/extraction-eval.test.js`.
  - Covers date/number/URL/text matching, best evidence selection, precision/coverage, threshold, and hallucination metrics.
- Added `eval/golden/README.md`.
  - Documents the git-managed JSON label shape.
- Added `docs/ai_extraction_evaluation.md`.
  - Documents seed generation, evaluation commands, metrics, and current status.

## Verification

- `pnpm --filter posterlink-crawler test`
  - Passed: 152 tests.
- `pnpm eval:sample -- --limit=120 --output=data/eval/extraction-golden-seed.json`
  - Generated 120 reviewer seed items.
  - Included 1,000 evidence rows in the seed context.
- `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-empty-check.json`
  - Passed with 0 labeled files, as expected before human labels are added.
- `git diff --check`
  - Passed; only Windows line-ending warnings.

## Remaining Phase 2 Work

- Human-review the 120 seed items against original sources.
- Add reviewed JSON labels under `eval/golden/*.json`.
- Re-run `pnpm eval:extraction`.
- Commit the resulting field thresholds only after enough labeled data supports them.

