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

## Batch 5 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch5 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch5-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- `isPoster=true`: 19
- `isPoster=false`: 1
- Confidence range: 0.92 to 0.98

Non-poster classification:

- `마포구·금천구 청소년, '행복한 도시 조건 TOP5' 선정(2026.06.14.)`
  - `news article webpage screenshot`, confidence 0.94

Post-apply poster-detection dry-run:

- Evidence rows: 358
- `is_real_poster=true`: 353
- `is_real_poster=false`: 5
- Ambiguous: 192
- `needs_vlm`: 192

No batch5 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 5 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch5 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 19, `false` x 1
- Confidence range: 0.92 to 0.98

Post-apply DB verification confirmed 20 rows for the batch5 poster ids.

Post-apply tier dry-run:

- A: 127
- B: 3
- C: 420
- `critical_missing_is_real_poster`: 192
- `critical_missing_deadline_type`: 261
- calendar/deadlineAlert gate: 119

## Batch 6 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch6 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch6-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- `isPoster=true`: 19
- `isPoster=false`: 1
- Confidence range: 0.86 to 0.98

Non-poster classification:

- `강서여성새로일하기센터 <직업상담사 선배가 들려주는 진짜 이야기>`
  - `decorative illustration / social graphic`, confidence 0.86

Post-apply poster-detection dry-run:

- Evidence rows: 378
- `is_real_poster=true`: 372
- `is_real_poster=false`: 6
- Ambiguous: 172
- `needs_vlm`: 172

No batch6 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 6 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch6 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 19, `false` x 1
- Confidence range: 0.86 to 0.98

Post-apply DB verification confirmed 20 rows for the batch6 poster ids.

Post-apply tier dry-run:

- A: 133
- B: 3
- C: 414
- `critical_missing_is_real_poster`: 172
- `critical_missing_deadline_type`: 261
- `critical_low_confidence_is_real_poster`: 3
- calendar/deadlineAlert gate: 119

## Batch 7 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch7 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch7-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- `isPoster=true`: 18
- `isPoster=false`: 2
- Confidence range: 0.92 to 0.98

Non-poster classifications:

- `3층 종합체육관 내 농구대 부품 교체·설치 안내`
  - `facility maintenance notice`, confidence 0.92
- `센터 1층 정문 쪽 점자블럭 양생에 따른 안내`
  - `facility_notice`, confidence 0.92

Post-apply poster-detection dry-run:

- Evidence rows: 398
- `is_real_poster=true`: 390
- `is_real_poster=false`: 8
- Ambiguous: 152
- `needs_vlm`: 152

No batch7 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 7 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch7 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 18, `false` x 2
- Confidence range: 0.92 to 0.98

Post-apply DB verification confirmed 20 rows for the batch7 poster ids.

Post-apply tier dry-run:

- A: 138
- B: 3
- C: 409
- `critical_missing_is_real_poster`: 152
- `critical_missing_deadline_type`: 261
- `critical_low_confidence_is_real_poster`: 3
- calendar/deadlineAlert gate: 119

## Batch 8 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch8 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch8-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- Non-poster count: 0
- `isPoster=true`: 20
- Confidence range: 0.95 to 0.98

Post-apply poster-detection dry-run:

- Checked rows: 538
- Evidence rows: 406
- `is_real_poster=true`: 398
- `is_real_poster=false`: 8
- Ambiguous: 132
- `needs_vlm`: 132

No batch8 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 8 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch8 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 20
- Confidence range: 0.95 to 0.98

Post-apply DB verification confirmed 20 rows for the batch8 poster ids.

Post-apply tier dry-run:

- Checked rows: 538
- A: 141
- B: 3
- C: 394
- `critical_missing_is_real_poster`: 132
- `critical_missing_deadline_type`: 261
- `critical_low_confidence_is_real_poster`: 3
- calendar/deadlineAlert gate: 115

## Batch 9 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch9 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch9-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- Non-poster count: 0
- `isPoster=true`: 20
- Confidence range: 0.93 to 0.98

Post-apply poster-detection dry-run:

- Checked rows: 538
- Evidence rows: 426
- `is_real_poster=true`: 418
- `is_real_poster=false`: 8
- Ambiguous: 112
- `needs_vlm`: 112

No batch9 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 9 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch9 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 20
- Confidence range: 0.93 to 0.98

Post-apply DB verification confirmed 20 rows for the batch9 poster ids.

Post-apply tier dry-run:

- Checked rows: 538
- A: 144
- B: 3
- C: 391
- `critical_missing_is_real_poster`: 112
- `critical_missing_deadline_type`: 261
- `critical_low_confidence_is_real_poster`: 3
- calendar/deadlineAlert gate: 115

## Batch 10 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch10 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch10-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- `isPoster=true`: 19
- `isPoster=false`: 1
- Confidence range: 0.92 to 0.98

Non-poster classification:

- `2026년 희망두배 청년통장 신규 참여자 모집`
  - `administrative notice / recruitment table`, confidence 0.92

Post-apply poster-detection dry-run:

- Checked rows: 538
- Evidence rows: 446
- `is_real_poster=true`: 437
- `is_real_poster=false`: 9
- Ambiguous: 92
- `needs_vlm`: 92

No batch10 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 10 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch10 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 19, `false` x 1
- Confidence range: 0.92 to 0.98

Post-apply DB verification confirmed 20 rows for the batch10 poster ids.

Post-apply tier dry-run:

- Checked rows: 538
- A: 148
- B: 3
- C: 387
- `critical_missing_is_real_poster`: 92
- `critical_missing_deadline_type`: 261
- `critical_low_confidence_is_real_poster`: 3
- calendar/deadlineAlert gate: 115

## Batch 11 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch11 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch11-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- Non-poster count: 0
- `isPoster=true`: 20
- Confidence range: 0.86 to 0.98

Post-apply poster-detection dry-run:

- Checked rows: 538
- Evidence rows: 466
- `is_real_poster=true`: 457
- `is_real_poster=false`: 9
- Ambiguous: 72
- `needs_vlm`: 72

No batch11 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.

## Batch 11 is_real_poster evidence apply

Applied after explicit user approval:

- Approved phrase:
  `VLM batch11 20건 결과를 is_real_poster evidence로 운영 DB 적용 승인합니다.`
- Applied rows: 20
- Field: `is_real_poster`
- Extractor: `poster-detection-signals-v1`
- Value: `true` x 20
- Confidence range: 0.86 to 0.98

Post-apply DB verification confirmed 20 rows for the batch11 poster ids.

Post-apply tier dry-run:

- Checked rows: 538
- A: 153
- B: 3
- C: 382
- `critical_missing_is_real_poster`: 72
- `critical_missing_deadline_type`: 261
- `critical_low_confidence_is_real_poster`: 4
- calendar/deadlineAlert gate: 115

## Batch 12 production apply

Applied after explicit user approval:

- Approved phrase:
  `needs-vlm 이미지 분류 batch12 20건 운영 DB 적용 승인합니다.`
- Command:
  `pnpm --filter posterlink-crawler image:backfill -- --limit=20 --concurrency=1 "--statuses=published,review" --needs-vlm-only --apply --output=data/results/needs-vlm-image-classification-batch12-apply.json`
- Candidate count: 20
- Applied count: 20
- Failed count: 0
- `isPoster=true`: 19
- `isPoster=false`: 1
- Confidence range: 0.92 to 0.98

Non-poster classification:

- `마포청소년문화의집, 국가보훈부 공모 3년 연속 선정 (2026.03.03.)`
  - `news article / webpage screenshot`, confidence 0.92

Post-apply poster-detection dry-run:

- Checked rows: 538
- Evidence rows: 486
- `is_real_poster=true`: 476
- `is_real_poster=false`: 10
- Ambiguous: 52
- `needs_vlm`: 52

No batch12 `is_real_poster` evidence rows were applied in this step. That
conversion requires a separate operating DB approval.
