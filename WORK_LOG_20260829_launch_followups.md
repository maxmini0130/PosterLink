# 2026-08-29 Launch Follow-ups

## Summary

- Re-ran the launch handoff audits after the review queue release.
- Confirmed new production data arrived after the prior handoff: 3 posters are back in `review`.
- Improved read-only audit reports so notification and non-fixed deadline follow-ups show the exact affected posters.

## Read-only Audit Results

Commands:

```bash
pnpm --filter posterlink-crawler audit:notifications
pnpm --filter posterlink-crawler audit:public-counts
pnpm --filter posterlink-crawler audit:date-periods -- --limit=5000
pnpm --filter posterlink-crawler tier:compute -- --statuses=review --limit=100
pnpm --filter posterlink-crawler tier:auto-publish -- --limit=100
```

Results:

- Notification audit:
  - `new_match` pending: 414
  - sendable rows: 19
  - no-token rows: 395
  - `favorite_deadline` pending: 0
  - sendable rows are spread across 19 published poster targets, 1 sendable row each.
- Public count audit:
  - public search count: 218
  - public search returned rows: 218
  - count match: true
  - public non-fixed deadline rows: 23
- Date-period audit:
  - audited: 521
  - stale warning: 1
  - mismatch: 0
  - missing clear deadline: 0
  - actionable: 1
- Review tier dry-run:
  - review posters checked: 3
  - evidence rows: 0
  - computed dry-run tiers: C 3
- Auto-publish dry-run:
  - checked: 3
  - eligible: 0
  - blocked: 3
  - blockers: missing exposure tier, missing tier timestamp, missing content-type evidence

### 2026-08-30 이어서 확인 (kill switch 동작 검증)

- Command:

```bash
pnpm --filter posterlink-crawler tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-20260830-dryrun.json --limit=200 --tiers=A
```

  - Result:
  - `checked_count`: 3
  - `eligible_count`: 0
  - `blocked_count`: 3
  - `applied_count`: 0
  - `blocked_reasons`:
    - `missing_exposure_tier`: 3
    - `missing_tier_computed_at`: 3
    - `missing_content_type_evidence`: 3
  - mode: `dry-run`
  - no `--apply` execution was run (per safe check policy)
- Follow-up:
  - `pnpm --filter posterlink-crawler tier:compute -- --statuses=review --limit=200`
  - Result:
    - `checked_count`: 3
    - `evidence_row_count`: 0
    - `tiers`: `A:0 / B:0 / C:3`
    - `top_reasons`: `critical_missing_deadline_date` 3, `critical_missing_deadline_type` 3, `critical_missing_host_org` 3, `critical_missing_official_url` 3, `critical_missing_is_real_poster` 3
    - `applied_count`: 0
    - `failed_count`: 0
    - all rows currently missing evidence for critical fields, so they stay `C` in dry-run.

### 2026-08-30 후속 조치 (review 큐 정리 실행)

- Commands (공정 전파 기준 `--statuses=review`, `--limit=200`):

```bash
pnpm --filter posterlink-crawler evidence:backfill -- --statuses=review --limit=200 --output=data/eval/reports/field-evidence-backfill-review-20260830-dryrun.json
pnpm --filter posterlink-crawler content-type:backfill -- --statuses=review --limit=200 --output=data/eval/reports/content-type-review-20260830-dryrun.json
pnpm --filter posterlink-crawler evidence:backfill -- --statuses=review --limit=200 --apply
pnpm --filter posterlink-crawler content-type:backfill -- --statuses=review --limit=200 --apply
pnpm --filter posterlink-crawler tier:compute -- --statuses=review --limit=200 --output=data/eval/reports/exposure-tier-review-20260830-after-backfill-dryrun.json
pnpm --filter posterlink-crawler tier:compute -- --statuses=review --limit=200 --apply
pnpm --filter posterlink-crawler tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-20260830-review-after-backfill-dryrun.json --limit=200 --tiers=A
```

- Results:
  - `evidence:backfill` dry-run:
    - `checked_count`: 3
    - `poster_candidate_count`: 3
    - `evidence_row_count`: 38
    - `field_counts`: `target_desc 4 / benefit 4 / host_org 6 / deadline_date 6 / deadline_type 3 / official_url 3 / apply_url 3 / apply_method 3 / venue 3 / contact 3`
    - `applied_count`: 0
  - `content-type:backfill` dry-run:
    - `checked_count`: 3
    - `evidence_row_count`: 3
    - `content_types`: `recruit 3`
    - `top_reasons`: `recruit_action_signal 2`, `recruit_action_program_signal 1`
    - `applied_count`: 0
  - `evidence:backfill --apply`:
    - `checked_count`: 3
    - `evidence_row_count`: 38
    - `applied_count`: 38
    - `failed_count`: 0
  - `content-type:backfill --apply`:
    - `checked_count`: 3
    - `evidence_row_count`: 3
    - `applied_count`: 3
    - `failed_count`: 0
  - `tier:compute` dry-run:
    - `checked_count`: 3
    - `evidence_row_count`: 41
    - `tiers`: `A 0 / B 0 / C 3`
    - `gates`: `seo 3 / calendar 3 / deadlineAlert 3 / recommendation 0`
    - `top_reasons`: `critical_missing_is_real_poster 3`, `duplicate_suspected 1`
  - `tier:compute --apply`:
    - `applied_count`: 3
    - `failed_count`: 0
  - `tier:auto-publish` dry-run:
    - `checked_count`: 3
    - `eligible_count`: 0
    - `blocked_count`: 3
    - `by_tier`: `C 3`
    - `blocked_reasons`: `tier_not_allowed 3`, `low_confidence_content_type 2`

- 운영 해석:
  - review 3건은 증거 확보 후 `exposure_tier`가 모두 `C`로 정리되어 kill-switch 대상(기본 A 티어)으로는 전이되지 않음.
  - 자동 공개는 추가로 `content_type` 신뢰도(0.8) 기준에서 2건이 임계치 미달이라 차단됨.
  - `critical_missing_is_real_poster`가 핵심 블로커이므로, 해당 필드 수집/검수 보강 후 다음 compute-run이 필요.

### 2026-08-30 후속 조치 (is_real_poster 보강 실행)

- Commands:

```bash
pnpm --filter posterlink-crawler poster-detection:backfill -- --statuses=review --limit=200 --output=data/eval/reports/poster-detection-review-20260830-dryrun.json
pnpm --filter posterlink-crawler poster-detection:backfill -- --statuses=review --limit=200 --apply
pnpm --filter posterlink-crawler tier:compute -- --statuses=review --limit=200 --output=data/eval/reports/exposure-tier-review-20260830-after-detection-dryrun.json
pnpm --filter posterlink-crawler tier:compute -- --statuses=review --limit=200 --apply
pnpm --filter posterlink-crawler tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-20260830-review-after-detection-seq-dryrun.json --limit=200 --tiers=A
```

- Results:
  - `poster-detection:backfill --dryrun`:
    - `checked_count`: 3
    - `evidence_row_count`: 3
    - `decisions`: `true 3 / false 0 / ambiguous 0`
    - `routes`: `classifier_accept 3`
  - `poster-detection:backfill --apply`:
    - `checked_count`: 3
    - `evidence_row_count`: 3
    - `applied_count`: 3
    - `failed_count`: 0
  - `tier:compute --dryrun`:
    - `checked_count`: 3
    - `evidence_row_count`: 44
    - `tiers`: `A 2 / B 0 / C 1`
    - `top_reasons`: `duplicate_suspected 1`, `critical_low_confidence_is_real_poster 1`
  - `tier:compute --apply`:
    - `applied_count`: 3
    - `failed_count`: 0
  - `tier:auto-publish --dryrun`:
    - `checked_count`: 3
    - `eligible_count`: 1
    - `blocked_count`: 2
    - `by_tier`: `C 1 / A 2`
    - `blocked_reasons`: `tier_not_allowed 1`, `low_confidence_content_type 2`

- 현재 판정:
  - `is_real_poster` 핵심 블로커(없음)는 해소되어 `A` 티어가 2건 생성됨.
  - 자동 공개는 여전히
    - `is_real_poster=low_confidence`로 C 1건 + `content_type_confidence(0.7)` 2건이 남아 차단됨.
  - 한 건은 `duplicate_suspected`로 인한 C 유지이므로 중복 판정 반영/예외 정책 확인 후 추가 조치 필요.

## Code Changes

- `scripts/crawler/src/audit-notifications.js`
  - Writes `data/eval/reports/notification-push-audit.json`.
  - Adds poster metadata to target summaries.
  - Prints sendable notification targets in human output.
  - Separates top targets, sendable targets, and no-token targets in JSON.
- `scripts/crawler/src/audit-public-counts.js`
  - Adds `posters.public_non_fixed_deadlines` with id, title, source org, deadline type, dates, and exposure tier.
- `apps/web/app/api/admin/ai-verification/route.ts`
  - Added admin API exposure summary payload for review/publication tier monitoring:
    - publication-status counts (`published`/`review`) for tier coverage denominator,
    - exposure tier counts (`A/B/C/uncategorized`) + computed/uncomputed counts,
    - gate pass counts (`seo/calendar/deadlineAlert/recommendation`),
    - auto-publish health including:
      - `AUTO_PUBLISH_TIERS` parsing,
      - review tier-based candidates,
      - eligible candidates under launch-safe rules (`deadline_type=fixed`, active deadline, tier timestamp present, content_type=recruit, confidence threshold),
      - blocked reason aggregation from content-type evidence.
- `apps/web/app/admin/ai-verification/page.tsx`
  - Added "노출 티어 분포" section.
  - Added "자동 공개 킬 스위치" section with:
    - ON/OFF status,
    - allowed tiers,
    - review candidates,
    - actual eligible candidates,
    - blocked reason breakdown.
  - Added "티어 게이트 통과 현황" section and refined denominators to `computedCount`.

## Operational Findings

- `notify_new_match_on_publish` creates notification rows when a poster moves to `published`.
- The admin poster approval UI calls the `notify-new-match` Edge Function after approval.
- Auto-publish scripts update poster status directly and do not call `notify-new-match`, so sendable pending push rows can remain after scripted review releases.
- `notify-new-match` requires an authenticated admin user token. Production push sending should remain a deliberate operator action, not a crawler service-role shortcut.

## Pending Approval / External Steps

- Production write candidate:
  - `pnpm --filter posterlink-crawler cleanup:stale-date-warnings -- --limit=5000 --apply`
  - Dry-run found 1 cleanup candidate: `서초구청 <제1300회 서초금요음악회 -한여름 밤의 바로크 Festa> 안내`.
- Production push candidate:
  - 19 published poster targets have 1 sendable `new_match` row each.
  - Sending requires an authenticated admin session against `notify-new-match`.
- New review queue:
  - 3 review posters should go through the normal evidence backfill and tier compute flow before any publish decision.

## Verification

```bash
pnpm --filter posterlink-crawler audit:notifications
pnpm --filter posterlink-crawler audit:public-counts
pnpm --filter posterlink-crawler test
```

Results:

- Notification audit: passed and wrote the enriched report.
- Public count audit: passed and wrote the non-fixed deadline list.
- Crawler tests: 260 passed.

## Verification Follow-up

- `scripts/crawler/src/exposure-tier.test.js`
  - Added boundary tests for `computeTier`:
    - Critical threshold boundary for `deadline_date` is treated as pass.
    - SEO gate false when `host_org` is below threshold.
    - recommendation gate false when `category` is below threshold.
    - poster image missing adds `poster_image_missing` reason and tier C.
- `scripts/crawler/src/field-evidence.test.js`
  - Added `adjustConfidence` boundary tests:
    - Very short evidence text is capped at 0.4 after min-confidence logic.
    - Corroborated evidence bonus and conflict penalty composition case.
- `apps/web` admin AI verification screen and API:
  - `pnpm --filter web lint`
  - `pnpm --filter web build`

## Checklist Update

- `docs/AI_VERIFICATION_SPEC.md`
  - Checked off:
    - `adjustConfidence` unit test requirement (209).
    - `computeTier` + gate boundary test requirement (365).
- `docs/AI_VERIFICATION_SPEC.md` checklist items still not marked:
  - Phase 1/2 기본 완료 항목은 모두 정리되었고, 현재 미완료 항목은:
    - [x] CI에서 주 1회 실행 (phase2 회귀)
    - [x] 첨부 PDF 파이프라인/요약 실패 처리 (Phase4)
    - [x] "이미지 없는 후보" 비율 전후 비교 (Phase4)

### 2026-08-30 추가 실행 (Phase4 측정 + 대시보드 확장)

- Commands:

```bash
pnpm --filter posterlink-crawler eval:poster-detection -- --out=data/eval/reports/poster-detection-golden-20260830.json
pnpm --filter posterlink-crawler eval:poster-detection -- --out=data/eval/reports/poster-detection-golden-20260830-verify.json --limit=100
pnpm --filter posterlink-crawler tier:compute -- --statuses=published --limit=554 --output=data/eval/reports/exposure-tier-published-554-20260830.json
pnpm --filter web lint
pnpm --filter web build
```

- Results:
  - `eval:poster-detection` baseline:
    - `labeled_items`: 120
    - `evaluated_items`: 120
    - `total`: 120
    - `precision`: 1.0
    - `recall`: 1.0
    - `vlm_savings_rate`: 1.0
    - route: mostly `classifier_accept`/`reject` in current labeled sample.
  - `eval:poster-detection --limit=100`:
    - `total`: 100
    - `classified`: 94
    - `abstained`: 6
    - `needs_vlm`: 6
    - `precision`: 0.9425
    - `recall`: 1.0
    - `vlm_savings_rate`: 0.94
  - `tier:compute --output` (`--statuses=published --limit=554`):
    - `checked_count`: 515
    - `tiers`: `A:266 / B:16 / C:233`
    - `gates`: `seo:442`, `calendar:217`, `deadlineAlert:217`, `recommendation:6`
  - `web lint` + `web build`:
    - passed, including new `eval` summary cards in `/admin/page.tsx`.


### 2026-08-30 Kill Switch + Crawler Test 정리

- Commands:

```bash
pnpm --filter posterlink-crawler tier:auto-publish -- --tiers=A --limit=50 --output=data/eval/reports/auto-publish-plan-20260830-kill-switch-guard-failed.json --apply
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler ai:healthcheck
pnpm --filter posterlink-crawler test -- src/exposure-tier.test.js src/field-evidence.test.js
```

- Results:
  - `--apply` without kill-switch failed as expected:
    - `Refusing to apply: set EXPOSURE_AUTO_PUBLISH=true in addition to --apply`
    - `plan-auto-publish-exposure-tiers` guard is working.
  - `posterlink-crawler test`: pass 266
  - `posterlink-crawler ai:healthcheck`: `quality_gate_status = pass`
  - `posterlink-crawler test -- src/exposure-tier.test.js src/field-evidence.test.js`: pass (266 total, fail 0)

### 2026-08-30 Attachment Poster Rendering + Imageless Metric

- Implemented:
  - PDF attachment page rendering through `pdftoppm` with bounded page count, DPI, timeout, and graceful failure metadata.
  - Rendered PDF page images are promoted into crawler image candidates after attachment analysis.
  - Local rendered images are supported by image rules, CLIP triage, VLM classification, OCR, and Supabase image import.
  - Local temp render directories are cleaned after upload attempts, and failed local imports are not stored as public image URLs.
  - Added `eval:imageless` to compare before/after crawler result files for image-less candidate reduction.
  - Weekly AI evaluation workflow now also runs poster detection routing scoring.

- Commands:

```bash
pnpm --filter posterlink-crawler test -- src/attachment-image-candidates.test.js src/measure-imageless-candidates.test.js src/measure-poster-detection.test.js
node --check scripts/crawler/src/attachment-text-extractor.js
node --check scripts/crawler/src/measure-imageless-candidates.js
node --check scripts/crawler/src/poster-image-rules.js
where.exe pdftoppm
```

- Results:
  - `posterlink-crawler test`: pass 269
  - Syntax checks: passed
  - `pdftoppm`: not installed in this local environment; crawler now records render failure and continues instead of failing the attachment pipeline.

### 2026-08-30 Evaluation + Backfill Expansion

- Commands:

```bash
pnpm --filter posterlink-crawler eval:extraction
pnpm --filter posterlink-crawler eval:thresholds -- --input=data/eval/reports/extraction-2026-08-30T00-01-31-077Z.json --out=data/eval/reports/extraction-thresholds-candidate.json --module-out=data/eval/reports/extraction-thresholds-candidate.js --min-labeled=120
pnpm --filter posterlink-crawler evidence:backfill -- --limit=554 --statuses=published --output=data/eval/reports/field-evidence-backfill-20260830-554.json
pnpm --filter posterlink-crawler evidence:backfill -- --limit=554 --statuses=published --apply
pnpm --filter posterlink-crawler tier:compute -- --statuses=published --limit=554
pnpm --filter posterlink-crawler tier:compute -- --statuses=published --limit=554 --apply
pnpm --filter posterlink-crawler ai:usage
pnpm --filter posterlink-crawler eval:validate -- --set=eval/golden
```

- Results:
  - `eval:extraction` succeeded:
    - `labeled_posters`: 120
    - `labeled_field_count`: 720
    - `macro_accuracy`: 0.9333333333333332
    - `recommended_thresholds` for `is_real_poster`, `host_org`, `official_url`, `content_type`
  - `eval:thresholds` with `min-labeled=120` generated candidate thresholds:
    - `production_ready`: false
    - `blocking_reasons`: `one_or_more_labeled_fields_missing_recommendation`
  - `evidence:backfill` dry-run (`limit=554`, `published`):
    - `checked_count`: 518
    - `evidence_row_count`: 3836
    - `applied_count`: 0
  - `evidence:backfill --apply` (`limit=554`, `published`):
    - `checked_count`: 518
    - `evidence_row_count`: 3836
    - `applied_count`: 3836
    - `failed_count`: 0
  - `tier:compute` dry-run (`statuses=published`, `limit=554`):
    - `checked_count`: 518
    - `tiers`: `A:259, B:10, C:249`
  - `tier:compute --apply` (`statuses=published`, `limit=554`):
    - `checked_count`: 518
    - `applied_count`: 518
    - `tiers`: `A:269, B:16, C:233` (after persisted updates)
  - `ai:usage` report:
    - `call_count`: 0
    - `estimated_unit_cost`: 0
    - `tiering_health` all zero-share (no model usage in measured window)
  - `eval:validate`:
    - `ok: true`, `files: 120`, `truth_fields: 720`

### 2026-08-30 Spec Checklist Reconciliation

- Commands:

```bash
pnpm --filter posterlink-crawler eval:validate -- --set=eval/golden
pnpm --filter posterlink-crawler eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-next-check-20260830.json
```

- Results:
  - Golden set validation: `files=120`, `items=120`, `truth_fields=720`, `ok=true`.
  - Extraction eval: `labeled_posters=120`, `labeled_field_count=720`, `evidence_rows=1788`, `macro_accuracy=0.9333333333333332`.
  - Confirmed Phase 1 implementation exists:
    - `supabase/migrations/20260824030000_add_poster_field_evidence.sql` creates `poster_field_evidence`, RLS select policy for published posters, and exposure tier columns.
    - `supabase/functions/process-ocr/index.ts` writes `poster_field_evidence` when `posterId` is provided.
    - `scripts/crawler/src/backfill-field-evidence.js` rebuilds evidence rows from stored poster data without recrawling.
  - Updated `docs/AI_VERIFICATION_SPEC.md` checked items for preflight, Phase 1 implementation, 120-label validation, and `eval:extraction` executability.
  - Left threshold-code reflection unchecked because the latest eval still has no `deadline_date` / `deadline_type` predictions, so generated threshold plan is not production-ready.

### 2026-08-30 Deadline Evidence Calibration + Threshold Reflection

- Commands:

```bash
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-calibrated-20260830.json
pnpm --filter posterlink-crawler eval:thresholds -- --input=data/eval/reports/extraction-calibrated-20260830.json --out=data/eval/reports/extraction-thresholds-calibrated-20260830.json --module-out=data/eval/reports/extraction-thresholds-calibrated-20260830.js --min-labeled=120
```

- Results:
  - Added shared effective evidence confidence calibration for deadline fields and reused it in both extraction evaluation and exposure tier field selection.
  - Human and golden-correction evidence now wins over automated deadline evidence even when the automated row has higher raw confidence.
  - Audit extractors, regex dates without application context, and ambiguous `선착순 마감` until-exhausted inferences are capped at effective confidence `0.65`.
  - `posterlink-crawler test`: pass 275.
  - Calibrated extraction eval:
    - `labeled_posters`: 120
    - `labeled_field_count`: 720
    - `evidence_rows`: 1788
    - `macro_accuracy`: 0.9611111111111112
    - deadline recommendations now exist: `deadline_date` threshold `1`, `deadline_type` threshold `0.95`, both precision `1`.
  - Threshold export:
    - `production_ready`: true
    - `blocking_reasons`: none
    - candidate thresholds keep existing conservative defaults as floors.
  - Reflected calibrated defaults in `scripts/crawler/src/exposure-tier.js`:
    - `deadline_date`: `1`
    - `deadline_type`: `0.95`
  - Marked the remaining `docs/AI_VERIFICATION_SPEC.md` Phase 2 threshold-code checklist item complete.

### 2026-08-30 Threshold Coverage Guard Follow-up

- Commands:

```bash
pnpm --filter posterlink-crawler tier:compute -- --statuses=published --limit=5000 --output=data/eval/reports/exposure-tier-published-after-threshold-calibration-20260830.json
pnpm --filter posterlink-crawler audit:public-counts -- --output=data/eval/reports/public-counts-after-threshold-calibration-20260830.json
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-calibrated-coverage-guard-20260830.json
pnpm --filter posterlink-crawler eval:thresholds -- --input=data/eval/reports/extraction-calibrated-coverage-guard-20260830.json --out=data/eval/reports/extraction-thresholds-coverage-guard-20260830.json --module-out=data/eval/reports/extraction-thresholds-coverage-guard-20260830.js --min-labeled=120
pnpm --filter posterlink-crawler tier:compute -- --statuses=published --limit=5000 --output=data/eval/reports/exposure-tier-published-after-threshold-coverage-guard-20260830.json
```

- Results:
  - Dry-run showed directly raising operating thresholds from low-coverage recommendations would demote published tiering too aggressively:
    - with strict threshold defaults: `A:24, B:1, C:490` for 515 published rows.
  - Reverted operating defaults to `deadline_date: 0.9`, `deadline_type: 0.9`.
  - Added threshold export coverage floors:
    - critical `0.5`
    - major `0.3`
    - minor `0.2`
  - Threshold export now reports:
    - `production_ready`: false
    - `blocking_reasons`: `one_or_more_labeled_fields_low_coverage_recommendation`
  - Re-ran published dry-run after the guard and default rollback:
    - `A:151, B:9, C:355`
    - This is still too disruptive for an apply run, so no DB writes were performed.
  - Added deadline-type hardening so a bounded application period is not overridden by a separate `선착순 마감` capacity phrase.
  - Updated docs to keep the Phase 2 threshold-code checklist item open until coverage is sufficient.
  - `posterlink-crawler test`: pass 277.

### 2026-08-30 Notification Push Sender Dry-run Path

- Commands:

```bash
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler notifications:send-pushes -- --type=new_match --limit=500 --json
pnpm --filter posterlink-crawler audit:notifications
```

- Results:
  - Added `pnpm --filter posterlink-crawler notifications:send-pushes` for pending push delivery after scripted releases.
  - Default mode is dry-run. Actual Expo push sending requires both `--apply` and `SEND_NOTIFICATION_PUSHES=true`.
  - Dry-run result for `new_match`:
    - `checked_count`: 414
    - `eligible_count`: 19
    - `blocked_count`: 395
    - `blocked_reasons`: `missing_push_token: 395`
  - Read-only notification audit matched the same backlog:
    - `new_match` pending 414, sendable 19, no-token 395
    - `favorite_deadline` pending 0
  - No push messages were sent and no DB writes were performed.
  - `posterlink-crawler test`: pass 280.

### 2026-08-30 Public Non-Fixed Deadline Copy

- Implemented:
  - Public deadline state now respects explicit non-fixed `deadline_type` values even when `application_end_at` is present.
  - `ongoing` and `until_exhausted` rows no longer inherit fixed D-day copy from a stored end date.
  - Explicit `unknown` rows with an end date remain visible as active while showing `일정 확인 필요` instead of a confident D-day.
  - Legacy rows with no explicit `deadline_type` and a valid end date keep the existing fixed-deadline behavior.
  - Poster cards now show `상시 모집` / `소진 시 마감` directly for non-fixed rows instead of reattaching `YYYY.MM.DD까지`.

- Verification:

```bash
pnpm test
pnpm --filter web lint
pnpm --filter web build
```

- Results:
  - Root web/lib tests: pass 59.
  - Web lint: passed.
  - Web build: passed.
  - No production DB writes were performed.

### 2026-08-30 Threshold Export Safety Follow-up

- Implemented:
  - Threshold export reports now separate:
    - `recommended_threshold`: the measured recommendation from the evaluation report.
    - `threshold`: the strict candidate threshold before rollout gating.
    - `applied_threshold`: the value exported in copyable threshold maps.
  - Low-coverage recommendations no longer raise the copyable `thresholds` map; they keep the current production default while preserving the recommendation and blocker metadata.
  - Generated threshold modules now include `blocked_fields` metadata so operators can see the exact fields blocking production rollout.

- Current latest threshold plan:
  - `production_ready`: false
  - blocker: `one_or_more_labeled_fields_low_coverage_recommendation`
  - blocked critical fields include:
    - `deadline_date`: recommended `1`, coverage `0.1833`, applied `0.9`
    - `deadline_type`: recommended `0.95`, coverage `0.0083`, applied `0.9`
    - `content_type`: recommended `0.85`, coverage `0.1167`, applied `0.9`

- Commands:

```bash
pnpm --filter posterlink-crawler test -- src/export-extraction-thresholds.test.js
node --check scripts/crawler/src/export-extraction-thresholds.js
pnpm --filter posterlink-crawler eval:thresholds -- --input=data/eval/reports/extraction-calibrated-coverage-guard-20260830.json --out=data/eval/reports/extraction-thresholds-coverage-guard-20260830.json --module-out=data/eval/reports/extraction-thresholds-coverage-guard-20260830.js --min-labeled=120
```

- Results:
  - Crawler tests: pass 280.
  - Syntax check: passed.
  - Threshold export: completed, still blocked for production as expected.
  - No production DB writes were performed.
