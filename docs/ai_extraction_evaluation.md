# AI Extraction Evaluation

This is the Phase 2 harness from `AI_VERIFICATION_SPEC.md`.

It evaluates field-level rows in `poster_field_evidence` against human-labeled
JSON files in `eval/golden`.

## Commands

Create a reviewer seed:

```bash
pnpm eval:sample -- --limit=120 --output=data/eval/extraction-golden-seed.json
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

## Metrics

The report includes:

- field accuracy
- `precision@τ`
- `coverage@τ`
- hallucination rate for labels explicitly marked as absent with `null`
- recommended threshold per field

Threshold selection follows the spec:

- critical fields target `precision@τ >= 0.98`
- major and minor fields target `precision@τ >= 0.90`

## Labeling Rules

Labels live in `eval/golden/*.json`.

Only include fields that were checked against the original source. If a field is
confirmed absent, use `null`. If a field was not reviewed, omit it.

See `eval/golden/README.md` for the JSON shape.

## Current Status

The harness and reviewer seed generator are implemented and executable. The 120
human-reviewed labels still need to be added before thresholds can be treated as
production constants for Phase 3.
