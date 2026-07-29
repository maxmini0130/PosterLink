# AI Baseline Evaluation

Use this workflow to measure the current PosterLink AI extraction baseline before
claiming or improving toward the 95%+ structured-poster accuracy target.

For the reviewer-facing labeling rules, see
[`ai_human_golden_set_protocol.md`](./ai_human_golden_set_protocol.md).

## 1. Create a Golden-Set Sample

```bash
pnpm --filter posterlink-crawler baseline:sample -- --limit=100 --output=data/baseline/goldenset_sample.csv
```

The CSV is written under `data/`, which is ignored by git.

## 2. Human Review

Fill only the `gold_*` columns:

- `1`: the current prediction is correct
- `0`: the current prediction is incorrect
- blank: exclude this sample from that metric

Main metrics:

- `gold_is_valid_poster`: poster/non-poster decision
- `gold_title_ok`: title extraction
- `gold_org_ok`: organization extraction
- `gold_deadline_ok`: deadline extraction
- `gold_category_ok`: category classification
- `gold_duplicate_ok`: duplicate decision
- `gold_image_ok`: poster image selection and completeness
- `gold_source_link_ok`: original source-page link selection

Helpful prediction columns:

- `predicted_quality_decision`: current quality-gate decision (`pass`, `review`, or `reject`)
- `predicted_quality_issues`: quality-gate reasons to compare against the human label

## 3. Score the Baseline

```bash
pnpm --filter posterlink-crawler baseline:score -- --input=data/baseline/goldenset_sample.csv --output=data/baseline/baseline_report.json
```

The JSON report includes `macro_accuracy` and per-metric accuracy values that can
be used as the measured baseline in planning material.
