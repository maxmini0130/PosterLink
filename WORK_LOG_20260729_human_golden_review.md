# Human Golden Review Work Log - 2026-07-29

## Source

- Human review input: user-provided modified copy of the golden-set CSV
- Canonical scored file:
  `data/baseline/human_golden_set_seed_20260728.csv`
- The reviewer compared poster images with source pages and recorded findings
  in `gold_notes`.

## Review Coverage

- Total rows: 100
- Reviewed published/review rows: 55
- Unreviewed rejected rows: 15
- Unreviewed pending candidates: 30
- Title, organization, deadline, category, and duplicate metrics remain
  unlabeled because they were outside this review scope.

## Note Conversion

- All reviewed rows except the note indicating a non-poster were marked as
  correct poster relevance predictions.
- Notes indicating approval were marked correct for image selection and source
  link.
- Image crop, wrong thumbnail, unknown thumbnail, detail-image selection, and
  missing multi-page image notes were marked incorrect for image selection.
- Direct application-form links were marked incorrect for source-link
  selection and excluded from image selection when comparison was not possible.
- Rejected and pending rows remained blank and were excluded from scoring.

## Baseline Result

- Labeled rows: 55
- Poster relevance: 54/55, 98.2%
- Image selection: 35/47, 74.5%
- Source link: 46/54, 85.2%
- Partial macro accuracy across these three reviewed metrics: 85.9%

Report:

`data/baseline/human_golden_set_report_20260728.json`

## Implementation

- Added `gold_image_ok` and `gold_source_link_ok` to generated golden-set CSVs.
- Added image-selection and source-link metrics to the baseline scorer.
- Corrected the poster-relevance labeling protocol to define `1` as a correct
  prediction rather than an unconditional real-poster label.

## Verification

- Crawler tests: 72/72 passed
- Embedding coverage: 100%
- Field verification coverage: 48.3%
- Image AI coverage: 20.6%
- Review queue reject candidates: 0
- Field correction candidates: 0
- Published/review non-poster reject candidates: 0
