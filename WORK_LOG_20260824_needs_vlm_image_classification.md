# 2026-08-24 Needs-VLM Image Classification Prep

## Context

- `poster-detection:backfill` still routes 292 published/review posters to `needs_vlm`.
- The existing image-classification backfill could process rows without stored
  image classification, but it did not have an operator-safe way to restrict a
  batch to only the cheap-signal ambiguous rows.

## Changes

- Added `--needs-vlm-only` to `scripts/crawler/src/backfill-image-classification.js`.
- The script now reuses `extractPosterSignals` and `decidePosterDetection` to
  filter candidates to rows that require VLM.
- Dry-run reports now include the cheap-signal route, reasons, and selected
  image metadata for review before any OpenAI calls or DB writes.

## Safety

- Dry-run remains the default.
- `--apply` is still required before the script calls the image classifier and
  writes `field_verification.posterImageOcr.imageClassification`.
- VLM calls should be run in small approved batches, then followed by
  `poster-detection:backfill` to convert high-confidence classifier results into
  `is_real_poster` evidence.

## Batch 2 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch2 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch2-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- Non-poster count: 0
- `isPoster=true`: 20
- Confidence range: 0.92 to 0.98

Post-apply poster-detection dry-run:

- Evidence rows: 298
- `is_real_poster=true`: 297
- `is_real_poster=false`: 1
- Ambiguous: 252
- `needs_vlm`: 252

No `is_real_poster` evidence rows were applied in this step. That conversion
requires a separate operating DB approval.

## Batch 2 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch2 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 20
- Confidence range: 0.92 to 0.98

Post-apply DB verification confirmed 20 rows for the batch2 poster ids.

Post-apply tier dry-run:

- A: 105
- B: 2
- C: 443
- `critical_missing_is_real_poster`: 252
- `critical_missing_deadline_type`: 261
- calendar/deadlineAlert gate: 119
