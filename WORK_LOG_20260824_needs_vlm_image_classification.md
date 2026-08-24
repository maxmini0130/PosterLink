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

## Batch 3 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch3 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch3-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- `isPoster=true`: 17
- `isPoster=false`: 3
- Confidence range: 0.92 to 0.97

Non-poster classifications:

- `마포 청소년 80명, 5개국 문화 체험...'동네에서 리투아니아부터 인도까지 세계여행'(2026.06.21.)`
  - `news article / webpage screenshot`, confidence 0.95
- `구립마포청소년문화의집, 보훈문화 확산 공로로 감사패 수상(2026.06.14.)`
  - `news website article screenshot`, confidence 0.95
- `마포구 청소년유해환경 신고 포상금 제도 안내`
  - `administrative_notice_scan`, confidence 0.92

Post-apply poster-detection dry-run:

- Evidence rows: 318
- `is_real_poster=true`: 314
- `is_real_poster=false`: 4
- Ambiguous: 232
- `needs_vlm`: 232

No batch3 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 3 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch3 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 17, `false` x 3
- Confidence range: 0.92 to 0.97

Post-apply DB verification confirmed 20 rows for the batch3 poster ids.

Post-apply tier dry-run:

- A: 111
- B: 3
- C: 436
- `critical_missing_is_real_poster`: 232
- `critical_missing_deadline_type`: 261
- calendar/deadlineAlert gate: 119

## Batch 4 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch4 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch4-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- Non-poster count: 0
- `isPoster=true`: 20
- Confidence range: 0.93 to 0.98

Post-apply poster-detection dry-run:

- Evidence rows: 338
- `is_real_poster=true`: 334
- `is_real_poster=false`: 4
- Ambiguous: 212
- `needs_vlm`: 212

No batch4 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 4 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch4 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 20
- Confidence range: 0.93 to 0.98

Post-apply DB verification confirmed 20 rows for the batch4 poster ids.

Post-apply tier dry-run:

- A: 122
- B: 3
- C: 425
- `critical_missing_is_real_poster`: 212
- `critical_missing_deadline_type`: 261
- calendar/deadlineAlert gate: 119
