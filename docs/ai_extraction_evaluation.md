# AI Extraction Evaluation

This is the Phase 2 harness from `AI_VERIFICATION_SPEC.md`.

It evaluates field-level rows in `poster_field_evidence` against human-labeled
JSON files in `eval/golden`.

## Commands

Create a reviewer seed:

```bash
pnpm eval:sample -- --limit=120 --pool-size=1000 --output=data/eval/extraction-golden-seed.json
```

The default sampler uses `--strategy=stratified`. It samples from a larger
recent operating pool and tries to include normal recruit rows, low-confidence
or C-tier rows, non-recruit/rejected rows, and duplicate-suspected rows. Use
`--strategy=newest` only when a plain latest-first sample is intentionally
needed.

Split the seed into reviewer-sized batches:

```bash
pnpm eval:review-batches -- --input=data/eval/extraction-golden-seed.json --output-dir=data/eval/review-batches --batch-size=20
```

Create a Markdown review sheet for a batch:

```bash
pnpm eval:review-sheet -- --input=data/eval/review-batches/batch-01.json --output=data/eval/review-batches/batch-01-review.md
```

The sheet is a local working artifact that shows source links, current critical
predictions, evidence snippets, and a small JSON edit block per item. Put final
labels back into the batch JSON top-level `truth` object; do not edit the sheet
as the source of truth.

Import completed review-batch labels into git-managed golden files:

```bash
pnpm eval:import-batch -- --input=data/eval/review-batches/batch-01.json --labeled-by=max
pnpm eval:import-batch -- --input=data/eval/review-batches/batch-01.json --labeled-by=max --apply
```

The import command is dry-run by default. It writes one JSON file per reviewed
poster under `eval/golden/` only when `--apply` is passed. Rows with empty
`truth` objects are skipped unless `--require-complete` is used.

Validate reviewed labels:

```bash
pnpm eval:validate -- --set=eval/golden --require-labels
```

Check labeling progress:

```bash
pnpm eval:status
```

Run the scored evaluation after reviewed labels exist:

```bash
pnpm eval:extraction -- --set=eval/golden --extractor=current
```

Equivalent package command:

```bash
pnpm --filter posterlink-crawler eval:extraction -- --set=eval/golden --extractor=current
```

The report is written to `data/eval/reports/` by default.

Export threshold candidates from a scored evaluation report:

```bash
pnpm eval:thresholds -- --input=data/eval/reports/extraction-current.json --out=data/eval/reports/extraction-thresholds-candidate.json --module-out=data/eval/reports/extraction-thresholds-candidate.js
```

The threshold export is a local artifact step. It summarizes whether the report
has enough labels and field-level recommendations, then emits copyable candidate
constants. Treat the generated constants as a review draft until the 120-item
golden set is complete.

## CI

`.github/workflows/ai-extraction-eval.yml` runs the same harness:

- weekly on Monday 03:00 KST
- manually via `workflow_dispatch`
- on pull requests that change `eval/golden` labels or the evaluator

The workflow always validates label shape. It scores current operating evidence
when `SUPABASE_URL` and `SUPABASE_KEY` secrets are available, then uploads the
JSON report as a 30-day artifact.

## Metrics

The report includes:

- field accuracy
- `precision@τ`
- `coverage@τ`
- hallucination rate for labels explicitly marked as absent with `null`
- recommended threshold per field
- threshold-candidate export readiness and fallback defaults

The status report includes:

- current labeled poster count
- remaining count against the generated 120-item seed
- field-level label counts
- least-labeled fields
- review batch bucket distribution

Threshold selection follows the spec:

- critical fields target `precision@τ >= 0.98`
- major and minor fields target `precision@τ >= 0.90`
- production threshold constants should be changed only after
  `pnpm eval:thresholds` reports `production_ready: true`

## Labeling Rules

Labels live in `eval/golden/*.json`.

Only include fields that were checked against the original source. If a field is
confirmed absent, use `null`. If a field was not reviewed, omit it.

The review batch files under `data/eval/review-batches/` are working files. For
each poster, open `context.source_key`, compare the source against
`review_fields`, and then put only reviewed values into the top-level `truth`
object. Use `pnpm eval:review-sheet` when you want a readable side-by-side
checklist for the batch. Completed batch files should be imported with
`pnpm eval:import-batch` so only reviewed `truth` values are copied under
`eval/golden/` for scoring. Run
`pnpm eval:validate -- --set=eval/golden --require-labels` before scoring to
catch empty labels, unknown fields, placeholders, invalid URLs, and invalid
date/number formats.

See `eval/golden/README.md` for the JSON shape.

## Current Status

The harness, stratified reviewer seed generator, and review batch generator are
implemented and executable.

Latest generated reviewer package:

- Seed:
  `data/eval/extraction-golden-seed-20260825-stratified.json`
- Review batches:
  `data/eval/review-batches-20260825/`
- Batch count: 6 batches of 20 posters.
- Sample buckets: normal recruit 60, low-confidence/visual uncertainty 36,
  non-recruit or rejected 16, duplicate suspected 8.

The 120 human-reviewed labels still need to be added under `eval/golden/`
before thresholds can be treated as production constants for Phase 3.
