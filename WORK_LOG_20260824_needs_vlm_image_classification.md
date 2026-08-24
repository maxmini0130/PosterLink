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
