# Human Golden Set Protocol

This protocol turns a sampled CSV into a human-reviewed golden set for measuring
PosterLink AI extraction quality.

## Generate The Review File

```bash
pnpm --filter posterlink-crawler baseline:sample -- --limit=100 --output=data/baseline/human_golden_set_seed_20260728.csv
```

The file is intentionally written under `data/`, so reviewer labels are not
committed accidentally.

## Label Columns

Use only these values in `gold_*` columns:

- `1`: prediction is correct
- `0`: prediction is incorrect
- blank: metric is not applicable or cannot be judged from the source

Do not change the `predicted_*`, `source_key`, `thumbnail_url`, or
`source_excerpt` columns while labeling.

## Metric Rules

`gold_is_valid_poster`

- `1` when `predicted_is_valid_poster` matches the human decision.
- `0` when the prediction and human decision differ.
- A real active poster/program/event/recruitment notice is valid. A facility or
  parking notice, homepage/accessibility artifact, result announcement,
  retrospective news, hiring/admin recruitment, or similar content is not.

`gold_title_ok`

- `1` when the title identifies the actual program/poster without board crumbs,
  provider-only text, or unrelated page labels.
- `0` when the title is missing, generic, garbled, provider-only, or describes a
  different notice.

`gold_org_ok`

- `1` when `predicted_org` is the actual organizer/host or a sufficiently
  specific operating institution.
- `0` when it is only a portal/source board name while the notice clearly names
  another organizer.

`gold_deadline_ok`

- `1` when `predicted_deadline` matches the application/recruitment deadline.
- `0` when it is missing despite a clear deadline, points to an event date
  instead of an application deadline, or picks the wrong date from multiple
  dates.
- blank when no clear deadline exists in the source.

`gold_category_ok`

- `1` when the assigned category is a reasonable user-facing category for the
  poster.
- `0` when the category is plainly unrelated.
- blank when category cannot be assessed from the excerpt/source.

`gold_duplicate_ok`

- `1` when duplicate handling is correct.
- `0` when the row should have merged with another known duplicate or was
  incorrectly treated as a duplicate.
- blank when duplicate status cannot be judged from this sample alone.

`gold_image_ok`

- `1` when `thumbnail_url` shows the correct, sufficiently complete poster or
  representative source image.
- `0` when the image is unrelated, incorrectly cropped, selects a detail image
  instead of the main poster, or omits other required poster pages.
- blank when the image cannot be compared against the source.

`gold_source_link_ok`

- `1` when `source_key` opens the original notice page that supports the poster.
- `0` when it opens only an application form, unrelated page, or indirect page
  while the original notice is available.
- blank when the original source cannot be identified.

## Score

After review:

```bash
pnpm --filter posterlink-crawler baseline:score -- --input=data/baseline/human_golden_set_seed_20260728.csv --output=data/baseline/human_golden_set_report_20260728.json
```

Record the resulting `macro_accuracy` and per-metric values in the project log or
planning material.
