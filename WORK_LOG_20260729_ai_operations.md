# PosterLink AI Operations Log - 2026-07-29

2026-07-29에는 전날 추가한 AI 백필/healthcheck 도구를 사용해 운영 데이터 커버리지를 목표치까지 확장하고, 결과를 검증했다.

## 1. 시작 상태 점검

실행:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --golden-set=data/baseline/human_golden_set_seed_20260728.csv --output=data/results/ai-healthcheck-start-20260729.json
```

시작 수치:

- embedding coverage: 100%
- field verification coverage: 37.8%
- image AI coverage: 8.0%
- review queue: 4건
- review queue reject candidates: 0건
- field correction candidates: 0건
- nonposter reject candidates: 0건
- golden set labeled rows: 0건

## 2. Field Verification Coverage 50% 이상 확대

실행:

```bash
pnpm --filter posterlink-crawler verify:backfill -- --limit=60 --concurrency=3 --apply --output=data/results/field-verification-backfill-20260729-apply-60.json
```

결과:

- candidate_count: 60
- applied_count: 60
- failed_count: 0
- concurrency: 3

중간 검증:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --golden-set=data/baseline/human_golden_set_seed_20260728.csv --output=data/results/ai-healthcheck-after-field-backfill60-20260729.json
```

- field verification coverage: 51.6%
- field correction candidates: 14건
- nonposter reject candidates: 0건

## 3. AI 보정값 실제 필드 반영

Dry-run:

```bash
pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 --min-confidence=0.85 --output=data/results/field-verification-corrections-20260729-after-backfill60-dryrun.json
```

- scanned_count: 225
- correction_count: 14

Apply:

```bash
pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 --min-confidence=0.85 --apply --output=data/results/field-verification-corrections-20260729-after-backfill60-apply.json
```

결과:

- correction_count: 14
- source_org_name 보정 포함
- application_end_at 보정/추가 포함

## 4. Image AI Coverage 20% 이상 확대

실행:

```bash
pnpm --filter posterlink-crawler image:backfill -- --limit=55 --concurrency=3 --apply --output=data/results/image-classification-backfill-20260729-apply-55.json
```

결과:

- candidate_count: 55
- applied_count: 55
- failed_count: 0
- nonposter_count: 1
- concurrency: 3

이미지 AI가 잡은 비포스터:

- `[소식] 마포구, 청소년 음악축제 '제3회 유스 썸머 나잇 페스타: 스쿨 樂(락) 스트리트'에 참가할 중·고등학교 밴드동아리 10개 팀 모집(2026.07.14.)`
- visualType: `news article webpage screenshot`
- reason: 온라인 뉴스 기사 화면이며, 독립적인 포스터/플라이어가 아니라는 판정.

## 5. 이미지 기반 비포스터 반려 처리

Dry-run:

```bash
pnpm --filter posterlink-crawler cleanup:review-nonposters -- --statuses=review,published --output=data/results/nonposter-cleanup-20260729-after-image55-dryrun.json
```

- reject_count: 1
- issue: `image-not-poster`

Apply:

```bash
pnpm --filter posterlink-crawler cleanup:review-nonposters -- --statuses=review,published --apply --output=data/results/nonposter-cleanup-20260729-after-image55-apply.json
```

결과:

- reject_count: 1
- 뉴스 기사 화면 1건을 `rejected` 처리.

## 6. 최종 Healthcheck

실행:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --golden-set=data/baseline/human_golden_set_seed_20260728.csv --output=data/results/ai-healthcheck-final-20260729.json
```

최종 수치:

- embedding coverage: 100%
- field verification coverage: 51.5%
- image AI coverage: 20.5%
- review queue: 4건
- review queue reject candidates: 0건
- image AI nonposter count: 0건
- image AI low confidence count: 0건
- field correction candidates: 0건
- nonposter reject candidates: 0건
- golden set labeled rows: 0건
- golden set macro accuracy: n/a

## 7. 최종 검증

추가 dry-run:

```bash
pnpm --filter posterlink-crawler cleanup:review-nonposters -- --statuses=review,published --output=data/results/nonposter-cleanup-20260729-final-dryrun.json
pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 --min-confidence=0.85 --output=data/results/field-verification-corrections-20260729-final-dryrun.json
```

결과:

- published/review 비포스터 reject 후보: 0건
- field verification correction 후보: 0건

테스트:

```bash
pnpm --filter posterlink-crawler test
git diff --check
```

결과:

- crawler tests: 72/72 통과
- `git diff --check`: 통과

## 8. 남은 작업

- Human golden set `gold_*` 라벨링은 아직 사람이 확정해야 한다.
- 라벨링 후 `baseline:score`를 실행해 실제 baseline accuracy를 확정해야 한다.
- 이후 image AI coverage를 30~50%까지 추가 확대할 수 있다.
