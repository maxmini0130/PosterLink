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

Keep the human-authored `gold_notes` intact during automated follow-up. Tools
may add `review_resolution` to record source rechecks and applied corrections.

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

## Recurring Error Guards

When a reviewed error is confirmed, fix both the affected data and the
collection rule that produced it.

- Keep the notice or organizer page as `source_key`. Store forms and
  registration pages separately as `official_apply`.
- Prefer a sufficiently large portrait source poster over a small listing crop.
- Keep all required pages for multi-page posters; the listing summary may stay
  first when the source presents a square carousel.
- Do not replace a usable poster with an extreme-height page composite.
- Enrich a generic title only when the program name is explicitly grounded in
  the source. Do not append another program name to an already specific title.
- Add a regression test for each confirmed error class and rerun the affected
  sample through `review:audit-notes`.
- Check `application_source_key_count` in `ai:healthcheck`; the expected value
  is zero.

## Score

After review:

```bash
pnpm --filter posterlink-crawler baseline:score -- --input=data/baseline/human_golden_set_seed_20260728.csv --output=data/baseline/human_golden_set_report_20260728.json
```

Record the resulting `macro_accuracy` and per-metric values in the project log or
planning material.

## Reconcile Reviewed Issues

After checking issue notes against the source pages and applying approved data
corrections, reconcile only the evidence-backed label interpretation:

```bash
pnpm --filter posterlink-crawler review:reconcile-goldenset -- --input=data/baseline/human_golden_set_seed_20260728.csv
```

This command preserves `gold_notes`, writes a UTF-8 BOM for Excel, and records
the follow-up in `review_resolution`. A corrected database value does not turn
an originally incorrect prediction into a correct baseline label.
