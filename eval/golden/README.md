# Extraction Golden Set

This directory stores git-managed JSON labels for `AI_VERIFICATION_SPEC.md`
Phase 2.

## File Shape

Use one JSON file per poster, or an object with an `items` array.

```json
{
  "poster_id": "375c5f75-5e5f-4ff1-b669-a617e6e696b2",
  "labeled_by": "max",
  "labeled_at": "2026-08-25",
  "truth": {
    "is_real_poster": true,
    "deadline_date": "2026-08-31",
    "deadline_type": "fixed",
    "host_org": "서울청년센터 동대문",
    "official_url": "https://example.go.kr/notice/123",
    "age_min": 18,
    "age_max": 34,
    "benefit": "이수 시 참여수당 50만원",
    "apply_method": "구글폼 신청"
  }
}
```

Only include fields that were checked against the original source. If a field is
confirmed absent, set it to `null`. If it was not reviewed, omit it.

## Run

```bash
pnpm eval:review-sheet -- --input=data/eval/review-batches-20260825/batch-01.json --output=data/eval/review-batches-20260825/batch-01-review.md
pnpm eval:import-batch -- --input=data/eval/review-batches-20260825/batch-01.json --labeled-by=max
pnpm eval:import-batch -- --input=data/eval/review-batches-20260825/batch-01.json --labeled-by=max --apply
pnpm eval:extraction -- --set=eval/golden --extractor=current
```

Reports are written under `data/eval/reports/`, which is ignored by git.
