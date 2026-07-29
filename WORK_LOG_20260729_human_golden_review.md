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

## Initial Note Conversion

- All reviewed rows except the note indicating a non-poster were marked as
  correct poster relevance predictions.
- Notes indicating approval were marked correct for image selection and source
  link.
- Image crop, wrong thumbnail, unknown thumbnail, detail-image selection, and
  missing multi-page image notes were marked incorrect for image selection.
- Direct application-form links were marked incorrect for source-link
  selection and excluded from image selection when comparison was not possible.
- Rejected and pending rows remained blank and were excluded from scoring.

## Initial Baseline Result

The first mechanical conversion of note phrases, before source-page
revalidation, produced:

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

## Source And Image Revalidation

The 20 issue-note rows were rechecked against the live source pages, source
images, and current database relations.

- Original-source corrections: 10
  - 8 directly noted by the reviewer
  - 2 additional rows with the same application-form `source_key` problem
- Representative-image corrections: 7
- Title/organization corrections: 14
- Human-confirmed non-poster rejections: 1
- Image notes found to be already correct after source comparison: 4
  - one source thumbnail was intentionally square and not cropped
  - two questioned images were the exact source posters
  - one three-page item already stored all three images

The original reviewer-authored `gold_notes` remain unchanged. The canonical CSV
adds `review_resolution` for the source recheck and database action.

Apply and verify:

```bash
pnpm --filter posterlink-crawler review:apply-corrections -- --apply --output=data/results/human-review-corrections-applied-20260729.json
pnpm --filter posterlink-crawler review:reconcile-goldenset -- --input=data/baseline/human_golden_set_seed_20260728.csv
```

Database verification passed for all 20 reviewed issue rows.

## Confirmed Baseline Result

After correcting the mechanical label interpretation with source evidence:

- Labeled rows: 55
- Poster relevance: 54/55, 98.2%
- Image selection: 39/47, 83.0%
- Source link: 44/54, 81.5%
- Partial macro accuracy: 87.5%

The image score increased because four questioned rows were valid on source
comparison. The source-link score decreased because two image-note rows also
used application forms as `source_key`.

## Poster Image Rule Fix

The source recheck exposed a false rejection in the image URL rule:
`KakaoTalk_*.png` uploads were classified as Kakao social assets. The broad
`kakao` URL rejection was removed while existing icon/SNS patterns remain.
The recovered 788x1119 source poster now scores 100 and is selected before the
400x400 source thumbnail.

## Systemic Prevention

The correction was extended from the reviewed rows to the collection pipeline
so that the same classes of errors are rejected or reordered before upload.

- Source and application links now have shared classification rules for Google
  Forms, Naver Forms, Microsoft Forms, Typeform, Tally, and common application
  URL paths and labels.
- Youth Seoul and generic-board adapters keep the notice page as the canonical
  source and store an externally resolved application form as
  `official_apply`.
- The uploader independently applies the same fallback, so an adapter
  regression cannot silently promote an application form to `source_key`.
- A strong full-size portrait poster now outranks and replaces a 400px listing
  crop.
- Multi-page square carousels keep the listing summary first while preserving
  every source page.
- Extreme vertical composites no longer displace a usable listing poster.
- AI image verification preserves the heuristic first choice instead of
  re-sorting it by raw candidate score.
- Generic provider titles are enriched only from a grounded quoted program
  name. Existing specific titles are not enriched twice.
- AI healthcheck now reports `application_source_key_count`.

The 20 issue-note rows were re-audited through the updated rules:

- Application forms selected as canonical source: 0
- Small square crop selected over a strong portrait original: 0
- Duplicated specific-title enrichment: 0
- Reviewer-noted source-link rows resolving to their notice pages: 8/8

Reports:

- `data/results/human-review-systemic-reaudit-20260729.json`
- `data/results/ai-healthcheck-systemic-guards-20260729.json`

## Final Verification

- Crawler tests: 88/88 passed
- Web config tests: 13/13 passed
- Human correction database verification: 20/20 passed
- Golden-set reconciliation is idempotent
- Golden-set UTF-8 BOM: `EF BB BF`
- Embedding coverage: 100%
- Field verification coverage: 48.2%
- Image AI coverage: 20.4%
- Review queue: 3
- Review queue reject candidates: 0
- Field correction candidates: 0
- Published/review non-poster reject candidates: 0
- Application-form source keys: 0
- Golden-set labeled rows: 55
- Golden-set partial macro accuracy: 87.5%
