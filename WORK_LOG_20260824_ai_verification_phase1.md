# 2026-08-24 AI Verification Phase 1

## Scope

- Implemented Phase 1 from `docs/AI_VERIFICATION_SPEC.md`.
- Added field-level extraction evidence storage, confidence calibration helpers, OCR evidence output/write path, and a dry-run-first backfill script.
- Did not apply the migration or write backfill rows to the operating database.

## Changes

- Added migration `supabase/migrations/20260824030000_add_poster_field_evidence.sql`.
  - Creates `poster_field_evidence` with field key, value, evidence text/source, extractor, and calibrated confidence.
  - Adds `posters.exposure_tier`, `tier_computed_at`, and `tier_reason` as Phase 3 cache columns.
  - Uses the real lifecycle column `poster_status = 'published'` for public read RLS.
- Added `scripts/crawler/src/field-evidence.js`.
  - Implements `adjustConfidence` with evidence cap, mismatch penalty, regex/corroboration boost, conflict penalty, and human override.
  - Normalizes current structured column names into the Phase 1 field key vocabulary.
- Added `scripts/crawler/src/backfill-field-evidence.js`.
  - Builds evidence rows from existing structured columns, `field_verification.readableNotice`, organization verification, and `poster_links`.
  - Defaults to dry-run; database writes require explicit `--apply`.
- Updated `supabase/functions/process-ocr/index.ts`.
  - Keeps existing response fields.
  - Adds `posterId` as an optional input.
  - Prompts the model to return `fieldEvidence` and `unresolved`.
  - Writes OCR evidence rows to `poster_field_evidence` when `posterId` and service-role env vars are available.
- Updated `docs/AI_VERIFICATION_SPEC.md` with confirmed live schema names and paths.

## Verification

- `pnpm --filter posterlink-crawler test`
  - Passed: 149 tests.
- `pnpm --filter posterlink-crawler evidence:backfill -- --limit=25 --output=data/results/field-evidence-backfill-phase1-dryrun.json`
  - Passed in dry-run mode.
  - Checked 25 posters.
  - Generated 269 evidence rows.
  - Applied 0 rows.
- `git diff --check`
  - Passed; only line-ending warnings for existing Windows checkout behavior.

## Remaining Operational Steps

- Applied the migration to the linked Supabase project after explicit approval.
- Deployed `process-ocr` after the migration existed in the database.
- Ran the full backfill in dry-run mode for all published/review posters and inspected the report.
- Ran backfill with `--apply` after explicit user direction.

## Operational Update

- User approved operating DB migration application.
- Ran `pnpm dlx supabase db push --linked --yes`.
- Applied migration:
  - `20260824030000_add_poster_field_evidence.sql`
- Verified on the linked remote project:
  - `public.poster_field_evidence` exists.
  - `posters.exposure_tier`, `posters.tier_computed_at`, and `posters.tier_reason` exist.
  - `poster_field_evidence_select_public_published` RLS SELECT policy exists.
  - `poster_field_evidence` has 0 rows before backfill.

## Process OCR Deployment And Backfill

- User requested continuing from step 2 through the remaining Phase 1 operational steps.
- Deployed `process-ocr` to the linked Supabase project.
  - Previous version: 11.
  - Deployed version: 12.
- Re-ran crawler tests after deployment.
  - `pnpm --filter posterlink-crawler test`: 149 passed.
- Updated the backfill script to fetch `poster_links` in 200-poster chunks.
  - Reason: full dry-run initially hit Supabase/PostgREST header limits when querying links for all poster IDs in one request.
- Full dry-run:
  - Command: `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-backfill-phase1-full-dryrun.json`
  - Checked posters: 550.
  - Evidence rows planned: 3,295.
  - Failed chunks: 0.
- Applied backfill:
  - Command: `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-backfill-phase1-apply.json --apply`
  - Checked posters: 550.
  - Evidence rows applied: 3,295.
  - Failed chunks: 0.
- Verified on the linked remote project:
  - `poster_field_evidence` row count after backfill: 3,295.
  - Field distribution:
    - `host_org`: 550
    - `official_url`: 549
    - `deadline_date`: 397
    - `target_desc`: 349
    - `venue`: 296
    - `apply_method`: 270
    - `contact`: 261
    - `benefit`: 224
    - `deadline_type`: 221
    - `apply_url`: 178

## High-confidence core P0 evidence apply

Applied after explicit user approval:

- Approved phrase:
  `high-confidence core P0 evidence 16 new rows operating DB apply approved.`
- Original approval:
  `고신뢰 핵심 P0 evidence 신규 16건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/field-evidence-high-core-p0-dryrun.json`
- Applied rows: 16
- Minimum confidence: 0.90
- Fields:
  - `host_org`: 8
  - `deadline_type`: 1
  - `official_url`: 4
  - `deadline_date`: 3

Post-apply DB verification confirmed all 16 selected rows.

Post-apply tier dry-run:

- Checked rows: 542
- A: 167
- B: 3
- C: 372
- SEO gate: 452
- calendar/deadlineAlert gate: 115
- `critical_missing_deadline_type`: 264
- `critical_missing_deadline_date`: 221
- `critical_low_confidence_deadline_date`: 115
- `critical_low_confidence_host_org`: 88

## New Review Gap Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `new-review gap evidence bundle 32 rows operating DB apply approved.`
- Original approval:
  `new-review gap evidence bundle 32건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/new-review-gap-evidence-bundle-dryrun.json`
- Applied rows: 32
- Fields:
  - `is_real_poster`: 6
  - `host_org`: 11
  - `deadline_date`: 3
  - `deadline_type`: 6
  - `official_url`: 6
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 32 selected rows.

Post-apply tier dry-run:

- Checked rows: 550
- A: 179
- B: 3
- C: 368
- SEO gate: 458
- calendar/deadlineAlert gate: 128
- `critical_missing_deadline_type`: 265
- `critical_missing_deadline_date`: 225
- `critical_missing_official_url`: 3
- `critical_missing_host_org`: 2
- `critical_missing_is_real_poster`: 2

Note: two new `review` rows entered the tier scope between the bundle dry-run
and post-apply tier check. They were outside the approved 32-row bundle and
account for the remaining `critical_missing_is_real_poster` and
`critical_missing_host_org` blockers.

## Residual Gap Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `residual gap evidence bundle 25 rows operating DB apply approved.`
- Original approval:
  `residual gap evidence bundle 25건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/residual-gap-evidence-bundle-dryrun.json`
- Applied rows: 25
- Fields:
  - `is_real_poster`: 5
  - `host_org`: 10
  - `official_url`: 4
  - `deadline_date`: 2
  - `deadline_type`: 4
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 25 selected rows.

Post-apply tier dry-run:

- Checked rows: 554
- A: 182
- B: 3
- C: 369
- SEO gate: 462
- calendar/deadlineAlert gate: 130
- `critical_missing_deadline_type`: 265
- `critical_missing_deadline_date`: 225
- `critical_low_confidence_deadline_date`: 105
- `critical_low_confidence_host_org`: 88
- `critical_missing_official_url`: 3

`critical_missing_is_real_poster` and `critical_missing_host_org` were removed
from the top reasons after this bundle, but a new review row entered the tier
scope during the run and accounts for one remaining multi-field gap.

## Post-Residual Critical Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `post-residual critical evidence bundle 37 rows operating DB apply approved.`
- Original approval:
  `post-residual critical evidence bundle 37건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/post-residual-critical-evidence-bundle-dryrun.json`
- Applied rows: 37
- Affected posters: 23
- Fields:
  - `deadline_type`: 23
  - `host_org`: 6
  - `official_url`: 3
  - `is_real_poster`: 3
  - `deadline_date`: 2
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 37 selected rows.

Post-apply tier dry-run:

- Checked rows: 557
- A: 202
- B: 3
- C: 352
- SEO gate: 465
- calendar/deadlineAlert gate: 152
- `critical_missing_deadline_type`: 245
- `critical_missing_deadline_date`: 226
- `critical_low_confidence_deadline_date`: 105
- `critical_low_confidence_host_org`: 88
- `critical_missing_official_url`: 3

The A-tier count increased by 20 and the deadline alert gate increased by 22.
One new row entered the published/review tier scope during the apply window,
so the post-apply checked count is 557 instead of the dry-run's 556.

## Final Auto Evidence Bundle Apply

Applied after explicit user approval:

- Approved phrase:
  `final auto evidence bundle 18 rows operating DB apply approved.`
- Original approval:
  `final auto evidence bundle 18건 운영 DB 적용 승인합니다.`
- Source dry-run:
  `data/results/final-auto-evidence-bundle-18-dryrun.json`
- Applied rows: 18
- Affected posters: 3
- Fields:
  - `host_org`: 6
  - `deadline_date`: 3
  - `deadline_type`: 3
  - `official_url`: 3
  - `is_real_poster`: 3
- Minimum confidence: 0.90

Post-apply DB verification confirmed all 18 selected rows.

Final auto-fill tier dry-run:

- Checked rows: 559
- A: 205
- B: 3
- C: 351
- SEO gate: 468
- calendar/deadlineAlert gate: 155
- `critical_missing_deadline_type`: 244
- `critical_missing_deadline_date`: 225
- `critical_low_confidence_deadline_date`: 105
- `critical_low_confidence_host_org`: 88
- `critical_missing_official_url`: 2
- `critical_low_confidence_official_url`: 2

This closes the repetitive Phase 1 automatic evidence-fill pass. Remaining
C-tier blockers are no longer good candidates for blind bulk evidence upserts;
they should move to manual review, crawler/parser fixes, or targeted
field-specific remediation.

## Admin Approval Source URL Fix

Fixed the P0 admin approval blocker where operator-edited posters could be
blocked by the pre-approval checklist even when a valid official notice URL was
stored.

- File: `apps/web/app/admin/posters/page.tsx`
- `getPrimarySourceUrl` now also accepts official notice URLs stored in
  `field_verification.humanStructuredVerification` and draft verification
  metadata.
- Single approval and bulk approval now refresh the poster's source URL from
  `poster_links` immediately before computing approval checklist results.
- Added an explicit error toast if an approval action cannot resolve the target
  poster object.

Validation:

- `pnpm --filter web lint`
- `pnpm test -- apps/web/lib/posterStructuredEditor.test.ts apps/web/lib/adminPosterFilters.test.ts`
- `pnpm --filter web build`

## Operator Registration UX Fix

Fixed two operator-facing P1 issues in the poster registration flow.

- File: `apps/web/app/operator/posters/new/page.tsx`
- Missing-image submission now scrolls and focuses the inline error near the
  submit area, so operators do not miss the failure reason when the toast is
  out of view.
- Registration submit button contrast was reinforced with an explicit border,
  white text, and clearer disabled colors.
- File: `apps/web/lib/posterHelpers.ts`
- Category ranking explicitly deprioritizes the real Korean `기타` category so
  operator/admin lists prefer a specific category when multiple category links
  exist.

Validation:

- `pnpm --filter web lint`
- `pnpm test -- apps/web/lib/posterImage.test.ts apps/web/lib/adminPosterFilters.test.ts`
- `pnpm --filter web build`

## Operator Re-Review Flow Fix

Fixed the rejected-poster correction flow so an operator edit can actually
request review again.

- File: `apps/web/app/operator/posters/[id]/edit/page.tsx`
- The edit page now remembers the poster's initial status.
- When a non-admin operator saves a poster that was initially `rejected`, the
  update also sets `poster_status` back to `review` and clears
  `rejection_reason`.
- The success toast now explicitly says that the correction was saved and
  re-review was requested.

Validation:

- `pnpm --filter web lint`
- `pnpm --filter web build`

## Search Logging Reliability Fix

Fixed the popular-keyword logging gap where live search result updates could
occur without a `/api/search-logs` call.

- File: `apps/web/app/posters/PosterListClient.tsx`
- Search logs are now recorded after result fetches for normalized search terms
  of at least two characters, with a one-minute same-term client cooldown.
- Initial query URLs also use the same logging guard and avoid one-character
  noise.
- File: `apps/web/app/api/search-logs/route.ts`
- The API now reads the bearer session token when available, stores the user id
  for non-internal users, and skips admin/super_admin/operator searches.
- File: `apps/web/app/admin/page.tsx`
- The dashboard popular-keyword copy now states that internal accounts are
  excluded.

Validation:

- `pnpm --filter web lint`
- `pnpm test -- apps/web/lib/discoveryRoutes.test.ts apps/web/lib/trafficAnalytics.test.ts`
- `pnpm --filter web build`

## Public Count Alignment Fix

Aligned public homepage, discovery, institution list, and sitemap counting
criteria.

- File: `apps/web/app/api/home/summary/route.ts`
- The homepage `activePosters` metric now uses the same
  `count_public_posters` RPC as `/posters`, preventing the homepage from
  showing a raw database count that differs from the public filtered list.
- Homepage `collectionSources` now counts only public institutions with a
  non-empty slug, matching institutions that can actually be opened publicly.
- File: `apps/web/lib/publicDiscovery.ts`
- Public institution discovery now excludes public institution rows without a
  slug and uses the same 500-row cap as the sitemap.
- File: `apps/web/app/sitemap.ts`
- Institution sitemap URLs now use the same public-with-slug criteria, avoiding
  empty/broken institution URLs and count drift.

Validation:

- `pnpm --filter web lint`
- `pnpm test -- apps/web/lib/discoveryRoutes.test.ts apps/web/lib/posterApplication.test.ts`
- `pnpm --filter web build`

## Poster Detail Summary Fallback Fix

Improved the public poster detail fallback facts shown when structured fields
are still missing.

- File: `apps/web/lib/posterSummaryFacts.ts`
- Detail cards can now derive 대상, 혜택, 신청방법, 비용 from unlabeled summary
  text only when explicit inline labels such as `모집대상:`, `지원내용:`,
  `신청방법:`, and `비용:` are present.
- Generic unlabeled phrases such as "혜택이 있습니다" remain ignored to avoid
  unsafe over-inference.
- File: `apps/web/lib/posterSummaryFacts.test.ts`
- Added regression coverage for inline explicit labels while preserving the
  no-unlabeled-inference rule.

Validation:

- `pnpm --filter web lint`
- `pnpm test -- apps/web/lib/posterSummaryFacts.test.ts`

## Home New Poster Date Basis Fix

Checked production crawler freshness and clarified why the public homepage can
show `오늘 새 공고 0건` even after crawler activity.

- Read-only production check showed the crawler ran successfully on 2026-08-25
  KST and created new review candidates, but no newly published public posters
  were present for the day.
- File: `apps/web/app/api/home/summary/route.ts`
- `todayNew` now uses an Asia/Seoul day boundary instead of the server's local
  midnight.
- `todayNew` now counts posters newly published today via `published_at`,
  falling back to `created_at` only for published rows without `published_at`.

Validation:

- `pnpm --filter web lint`
- `pnpm test -- apps/web/lib/trafficAnalytics.test.ts apps/web/lib/posterApplication.test.ts`

## Phase 2 Readiness Snapshot

Created the next-step read-only artifacts for moving from Phase 1 evidence fill
into Phase 2 golden-set evaluation.

- Tier dry-run:
  `data/eval/reports/exposure-tier-current-20260825.json`
- Golden seed:
  `data/eval/extraction-golden-seed-20260825.json`
- Current tier dry-run summary:
  - Checked posters: 559
  - Evidence rows: 4,520
  - A: 205
  - B: 3
  - C: 351
  - SEO gate: 468
  - Calendar/deadline alert gate: 155
  - Recommendation gate: 0
- Top remaining blockers:
  - `critical_missing_deadline_type`: 244
  - `critical_missing_deadline_date`: 225
  - `critical_low_confidence_deadline_date`: 105
  - `critical_low_confidence_host_org`: 88
  - `duplicate_suspected`: 11
- Golden seed contains 120 sampled posters and 1,437 current evidence rows for
  human review.

Validation:

- `pnpm --filter posterlink-crawler tier:compute -- --output=data/eval/reports/exposure-tier-current-20260825.json`
- `pnpm --filter posterlink-crawler eval:sample -- --limit=120 --output=data/eval/extraction-golden-seed-20260825.json`

## Phase 2 Review Batch Tool

Added a reviewer batching utility so the 120-poster Phase 2 seed can be reviewed
in manageable chunks.

- File: `scripts/crawler/src/prepare-extraction-review-batches.js`
- New package script:
  `pnpm --filter posterlink-crawler eval:review-batches`
- New root script:
  `pnpm eval:review-batches`
- The tool reads an extraction golden seed and writes:
  - `batch-XX.json` files with 20 posters each by default
  - `index.csv` for tracking source URLs and review progress
  - `summary.json` with batch counts
- File: `docs/ai_extraction_evaluation.md`
- Documented the seed -> review batches -> `eval/golden` -> evaluation flow.

Generated local review working files:

- `data/eval/review-batches-20260825/batch-01.json` through `batch-06.json`
- `data/eval/review-batches-20260825/index.csv`
- `data/eval/review-batches-20260825/summary.json`

Validation:

- `pnpm --filter posterlink-crawler eval:review-batches -- --input=data/eval/extraction-golden-seed-20260825.json --output-dir=data/eval/review-batches-20260825 --batch-size=20`
- `pnpm eval:review-batches -- --help`
- `pnpm --filter posterlink-crawler test`

## Phase 2 Golden Label Validator

Added a pre-scoring validator for Phase 2 golden labels.

- File: `scripts/crawler/src/validate-extraction-golden.js`
- New package script:
  `pnpm --filter posterlink-crawler eval:validate`
- New root script:
  `pnpm eval:validate`
- The validator checks:
  - missing or empty `truth`
  - unknown field keys
  - leftover review placeholders
  - `YYYY-MM-DD` date format for date fields
  - valid `http(s)` URLs for URL fields
  - numeric values for numeric fields
  - boolean values for `is_real_poster`
  - supported `deadline_type` values
- File: `docs/ai_extraction_evaluation.md`
- Documented validation before running extraction scoring.

Validation:

- `pnpm eval:validate -- --set=eval/golden`
- `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Expected failure while no golden JSON files exist yet.
- `pnpm eval:validate -- --help`
- `pnpm --filter posterlink-crawler test`

## Phase 5 Content Type Routing Tool

Started the Phase 5 feed-routing foundation without writing to the operating
database.

- Added `content_type` to the field evidence vocabulary and extraction
  evaluation field list.
- Added `scripts/crawler/src/content-type-routing.js`.
  - Routes rows to `recruit`, `news`, `admin`, or `discard`.
  - Treats rejected rows and known duplicate/corrupt issues as `discard`.
  - Treats facility staffing, hiring, bid, contract, and administrative notice
    rows as `admin`.
  - Keeps program/opportunity rows with application/recruitment signals as
    `recruit`.
- Added `scripts/crawler/src/backfill-content-type-evidence.js`.
  - Defaults to dry-run.
  - `--apply` only upserts `poster_field_evidence.content_type` rows after
    explicit approval.
- Connected `content_type` evidence to exposure tier computation so
  non-`recruit` rows remain C tier.
- Added `docs/ai_content_type_routing.md`.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 198 tests.
- `pnpm content-type:backfill -- --limit=120 --output=data/results/content-type-evidence-phase5-dryrun.json`
  - Dry-run only.
  - Checked posters: 120.
  - Evidence rows planned: 120.
  - Applied rows: 0.
  - Content types: `recruit` 119, `discard` 1.
- `pnpm tier:compute -- --limit=600 --output=data/eval/reports/exposure-tier-with-content-type-current-20260825.json`
  - Dry-run only.
  - Checked posters: 559.
  - Evidence rows: 4,520.
  - A: 205, B: 3, C: 351.
  - New content routing blocker observed: `content_type_news` 3.
- `pnpm eval:validate -- --set=eval/golden`
  - Passed with the current empty local golden set.

## Phase 6 Model Routing Foundation

Started the Phase 6 cost-control foundation without applying any operating DB
migration and without writing AI usage rows.

- Added `scripts/crawler/src/ai-model-routing.js`.
  - Defines model stages: `rule`, `cheap_text`, `high_text`, `vlm`.
  - Routes deterministic fields to rules first.
  - Routes `category`, `region`, `content_type`, and descriptive fields to the
    cheap text tier by default.
  - Escalates low-confidence critical fields to the high text tier.
  - Sends only ambiguous `is_real_poster` cases to VLM.
  - Builds `ai_usage_log`-compatible rows and internal cost-unit estimates.
- Added `scripts/crawler/src/measure-ai-model-routing.js`.
  - Read-only dry-run against current `poster_field_evidence`.
  - Reports planned model call pressure by stage and field.
- Added migration `supabase/migrations/20260825010000_add_ai_usage_log.sql`.
  - Prepares `public.ai_usage_log` and `public.ai_usage_daily_overview`.
  - Migration has not been applied to the operating DB.
- Added `docs/ai_model_routing.md`.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 204 tests.
- `pnpm ai:routing -- --limit=600 --output=data/eval/reports/ai-model-routing-current-20260825.json`
  - Read-only dry-run.
  - Checked posters: 559.
  - Evidence rows: 4,520.
  - Planned actions: 7,472.
  - Planned model calls: 4,371.
  - Stage distribution:
    - `rule`: 3,101
    - `cheap_text`: 2,606
    - `high_text`: 1,765
  - Estimated internal cost units: 40,512.

## User Feedback Loop Foundation

Started the field-level user feedback loop without applying any operating DB
migration.

- Added migration `supabase/migrations/20260825020000_add_field_reports.sql`.
  - Prepares `public.field_reports`.
  - Allows authenticated users to report a specific field once per poster.
  - Adds admin RLS and `field_report_field_overview` for field-level ranking.
  - Migration has not been applied to the operating DB.
- Added `POST /api/field-reports`.
  - Requires a logged-in user.
  - Accepts `posterId`, `fieldKey`, and optional `note`.
  - Allows reports only for published posters.
  - Uses server-side validation before inserting/upserting a report.
- Added `FieldReportButton` on public poster detail core facts.
  - Users can report inaccurate application target, period, region, age, cost,
    benefit, application method, or required document fields.

Validation:

- `pnpm --filter web lint`
- `pnpm --filter web build`

## Phase 6 And Feedback Loop DB Migration Apply

Applied after explicit user approval:

- Approval phrase:
  `승인합시다.`
- Applied with:
  `pnpm dlx supabase db push --linked --yes`
- Applied migrations:
  - `20260825010000_add_ai_usage_log.sql`
  - `20260825020000_add_field_reports.sql`

Remote verification:

- `ai_usage_log`: exists, count 0.
- `ai_usage_daily_overview`: exists, count 0.
- `field_reports`: exists, count 0.
- `field_report_field_overview`: exists, count 0.
- `pnpm dlx supabase migration list --linked` shows both migrations present
  remotely.

## Admin AI Verification Console

Added an admin-facing console for the Phase 6 and feedback-loop tables.

- Added `GET /api/admin/ai-verification`.
  - Requires admin or super admin.
  - Reads `ai_usage_daily_overview`, `field_report_field_overview`, and recent
    `field_reports`.
  - Enriches field reports with poster title/status and reporter nickname.
- Added `PATCH /api/admin/ai-verification`.
  - Allows admins to move field reports to `reviewing`, `actioned`, or
    `dismissed`.
  - Records the action in `admin_actions`.
- Added `/admin/ai-verification`.
  - Shows model call/token/image/cost-unit summary.
  - Shows stage-level usage distribution.
  - Shows field report ranking and pending field reports.
  - Flags same poster + same field reports when the count is at least 2.
- Added the page to the admin sidebar.

Validation:

- `pnpm --filter web lint`
- `pnpm --filter web build`

## Field Report Escalation Batch

Added the automated escalation batch for the user feedback loop. No operating
DB writes were performed.

- Added `scripts/crawler/src/field-report-escalation.js`.
  - Groups reports by `poster_id + field_key`.
  - Creates an escalation plan when the same field reaches the threshold.
  - Marks published posters as needing to move back to `review`.
- Added `scripts/crawler/src/process-field-reports.js`.
  - Defaults to dry-run.
  - `--apply` sets matching non-human `poster_field_evidence.confidence` to 0.
  - `--apply` moves published posters back to `review`.
  - `--apply` marks matched reports as `reviewing`.
  - `--apply` writes an `admin_actions` audit row.
- Added root/package command:
  `pnpm field-reports:process`
- Documented the command in `docs/ai_model_routing.md`.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 207 tests.
- `pnpm field-reports:process -- --threshold=2 --output=data/results/field-report-escalation-current-20260825.json`
  - Dry-run only.
  - Checked reports: 0.
  - Escalation candidates: 0.
  - Applied rows: 0.

## AI Usage Logging Integration

Connected initial AI call sites to `ai_usage_log`. No operating DB writes were
performed in this step.

- Added `scripts/crawler/src/ai-usage-logger.js`.
  - Builds VLM usage rows for image classification.
  - Inserts into `ai_usage_log` unless `POSTER_AI_USAGE_LOG=0`.
  - Returns non-throwing status objects so usage logging failures do not block
    the primary job.
- Updated `scripts/crawler/src/backfill-image-classification.js`.
  - When `--apply` performs image classification, it now logs one VLM usage row
    per classified poster.
  - Dry-run mode still performs no model calls and no DB writes.
- Updated `supabase/functions/process-ocr/index.ts`.
  - Writes a VLM `process-ocr` usage row after successful OpenAI OCR calls.
  - Captures model, input/output tokens when returned by OpenAI, image count,
    and estimated internal cost units.
  - Usage logging is skipped when `POSTER_AI_USAGE_LOG=0`.
  - Function deployment is still pending; code was not deployed in this step.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 210 tests.
- `pnpm --filter posterlink-crawler image:backfill -- --limit=1 --needs-vlm-only --output=data/results/image-classification-ai-usage-dryrun-20260825.json`
  - Dry-run only.
  - Candidate count: 0.
  - Applied rows: 0.

## Text Verification Usage Logging

Extended AI usage logging to the text field verification backfill path. No
operating DB writes were performed.

- Updated `scripts/crawler/src/poster-field-verifier.js`.
  - Fresh OpenAI `/v1/responses` calls now attach non-enumerable usage metadata
    to the returned verification object.
  - The metadata is intentionally non-enumerable so it is not persisted inside
    `posters.field_verification`.
- Updated `scripts/crawler/src/backfill-field-verification.js`.
  - When `--apply` performs a fresh field verification call, the batch records a
    `high_text` usage row in `ai_usage_log`.
  - Cached verifier results do not create duplicate usage rows.
- Updated `scripts/crawler/src/ai-usage-logger.js`.
  - Added high-text field verification usage row builder.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 211 tests.

## Crawler Upload Text Usage Logging

Extended AI usage logging to the crawler upload text-model paths. No operating
DB writes were performed.

- Updated `scripts/crawler/src/notice-facts-extractor.js`.
  - Fresh OpenAI calls now attach non-enumerable usage metadata for
    `notice_facts_extraction`.
  - Cached results do not create duplicate usage metadata.
- Updated `scripts/crawler/src/poster-relevance-router.js`.
  - Fresh OpenAI calls now attach usage metadata for `poster_relevance_route`.
- Updated `scripts/crawler/src/deadline-parser.js`.
  - LLM fallback deadline parsing now attaches `high_text` usage metadata for
    `deadline_parse_fallback`.
- Updated `scripts/crawler/src/upload-to-supabase.js`.
  - After a poster save succeeds, usage rows are linked to `posters.id`.
  - After a text notice candidate save succeeds, usage rows keep
    `poster_id=null` and store `candidateId/sourceKey/sourceUrl` in metadata
    because `ai_usage_log.poster_id` references only `posters.id`.
  - Logging remains best-effort and does not block crawler uploads.
- Updated `scripts/crawler/src/ai-usage-logger.js`.
  - Added generic text-model usage row builder and non-enumerable usage metadata
    helpers.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 213 tests.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## Naver Blog Ingester Usage Logging

Extended AI usage logging to the Naver blog RSS ingestion path. No operating DB
writes were performed.

- Updated `scripts/crawler/src/naver-blog-ingester.js`.
  - Logs `poster_relevance_route` and `deadline_parse_fallback` usage after a
    new sighting is processed.
  - Candidate-linked rows keep `poster_id=null` and store `candidateId`,
    `sightingId`, `sourceUrl`, and `blogId` in metadata.
  - Poster-linked rows store the matched `poster_id`.
  - Discarded rows can still log route usage against `sightingId` metadata, so
    LLM cost is visible even when no candidate is created.
  - Logging is best-effort and does not block ingestion.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 214 tests.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## AI Usage Read-Only Report Command

Added a read-only Phase 6 usage report command. No operating DB writes were
performed.

- Added `scripts/crawler/src/measure-ai-usage.js`.
  - Reads `ai_usage_daily_overview` and recent `ai_usage_log` rows.
  - Summarizes calls, tokens, image count, and internal cost units.
  - Groups usage by stage, operation, model, and status.
  - Reports whether recent rows are linked to `posters.id`, candidate/sighting
    metadata, or no object.
- Added root package command:
  `pnpm --filter posterlink-crawler ai:usage -- --days=14 --output=data/eval/reports/ai-usage-report.json`
- Added repo-root shortcut:
  `pnpm ai:usage -- --days=14 --output=data/eval/reports/ai-usage-report.json`
- Added `scripts/crawler/src/measure-ai-usage.test.js`.
- Updated `docs/ai_model_routing.md` with the command and current usage writers.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 215 tests.
- `pnpm --filter posterlink-crawler ai:usage -- --days=14 --output=data/eval/reports/ai-usage-current-20260825.json`
  - Read-only.
  - Current operating log rows in the 14-day report: 0.
  - This is expected until the newly connected jobs run, or until `process-ocr`
    is deployed.
- `pnpm ai:usage -- --days=14 --output=data/eval/reports/ai-usage-root-current-20260825.json`
  - Read-only.
  - Confirmed the repo-root shortcut works.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## Process OCR Function Deploy

Deployed the updated `process-ocr` Edge Function after user approval.

- Deployment command:
  `pnpm dlx supabase functions deploy process-ocr --project-ref zxndgzsfrgwahwsdbjdj`
- Before deploy:
  - `process-ocr` ACTIVE v12
  - `verify_jwt=true`
- After deploy:
  - `process-ocr` ACTIVE v13
  - `verify_jwt=true`
- The deployed code writes `process_ocr` usage rows into `ai_usage_log` after
  successful OpenAI OCR calls.

Validation:

- `pnpm dlx supabase functions list --project-ref zxndgzsfrgwahwsdbjdj`
  - Confirmed `process-ocr` ACTIVE v13.
- `pnpm ai:usage -- --days=14 --output=data/eval/reports/ai-usage-after-process-ocr-deploy-20260825.json`
  - Read-only.
  - Current operating log rows in the 14-day report: 0.
  - This is expected until the function is called after deployment.

## Crawler VLM Usage Event Handoff

Extended AI usage tracking across the crawl-result JSON boundary. No operating
DB writes were performed.

- Updated VLM callers:
  - `scripts/crawler/src/poster-image-classifier.js`
  - `scripts/crawler/src/poster-content-verifier.js`
  - `scripts/crawler/src/poster-ocr.js`
- Fresh OpenAI calls now attach non-enumerable usage metadata for:
  - `is_real_poster`
  - `poster_content_verification`
  - `poster_ocr`
- Updated `scripts/crawler/src/crawler.js`.
  - Converts non-enumerable call metadata into serializable `aiUsageEvents`
    before writing crawl result JSON.
  - Includes selected and non-selected candidate image checks, plus OCR for the
    selected poster image.
- Updated `scripts/crawler/src/upload-to-supabase.js`.
  - Upload now writes `aiUsageEvents` into `ai_usage_log` only after the poster
    or text notice candidate save succeeds.
  - Poster rows link via `poster_id`; text notice candidates stay linked through
    metadata because `ai_usage_log.poster_id` references only `posters.id`.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 214 tests.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## Embedding Usage Logging

Extended AI usage logging to poster embedding calls. No operating DB writes were
performed.

- Updated `scripts/crawler/src/poster-embedder.js`.
  - Fresh OpenAI embedding calls now attach non-enumerable `poster_embedding`
    usage metadata to the returned vector array.
  - Cached embedding vectors do not create duplicate usage metadata.
  - Serialized embedding arrays remain unchanged.
- Updated `scripts/crawler/src/upload-to-supabase.js`.
  - Poster upload now records embedding usage after an existing poster update or
    new poster insert succeeds.
- Updated `scripts/crawler/src/backfill-poster-embeddings.js`.
  - `--dry-run` remains read-only.
  - Non-dry-run updates now log `poster-embedding-backfill` usage rows after the
    embedding column update succeeds.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 214 tests.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## Content Type Evidence And Exposure Tier Operating Apply

Applied the approved Phase 5 `content_type` evidence bundle and then refreshed
Phase 1 exposure tiers in the operating DB.

Content type evidence:

- Dry-run command:
  `pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-approved-dryrun-20260825.json`
  - Checked: 598 posters.
  - Planned evidence: 598 rows.
  - Routes: recruit 556, discard 39, news 3.
- Initial approved apply command:
  `pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-approved-apply-20260825.json --apply`
  - Applied: 98 rows.
  - Failed chunk: 1.
  - Failure: invalid JSON caused by evidence text truncating inside an emoji
    surrogate pair.
- Stabilization:
  - Updated `backfill-content-type-evidence.js` to use smaller chunks and retry
    failed chunks row-by-row so future failures name the exact poster.
  - Updated `content-type-routing.js` to truncate by Unicode code point instead
    of UTF-16 code unit.
  - Added a regression test for emoji evidence text.
- Retry command:
  `pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-approved-apply-retry-20260825.json --apply`
  - Applied: 594 rows.
  - Failed: 4 rows with the same invalid JSON issue.
- Final approved apply command:
  `pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-approved-apply-final-20260825.json --apply`
  - Applied: 598 rows.
  - Failed: 0.
  - The earlier partial apply was completed by the final idempotent upsert.

Exposure tiers:

- Dry-run command:
  `pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-after-content-type-dryrun-20260825.json`
  - Checked: 559 posters.
  - Evidence rows read: 5079.
  - Planned tiers: A 205, B 3, C 351.
  - Gates: SEO 468, calendar 155, deadline alert 155, recommendation 0.
- First apply attempt:
  `pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-after-content-type-apply-20260825.json --apply`
  - Applied: 0 rows.
  - Failed: 3 chunks.
  - Failure: partial `posters` upsert hit the existing `title NOT NULL`
    constraint.
- Stabilization:
  - Updated `compute-exposure-tiers.js` to update only the tier columns per
    poster id instead of upserting partial poster records.
- Final approved apply command:
  `pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-after-content-type-apply-final-20260825.json --apply`
  - Applied: 559 rows.
  - Failed: 0.
  - Final tiers: A 205, B 3, C 351.
  - Final gates: SEO 468, calendar 155, deadline alert 155, recommendation 0.

Validation:

- `pnpm --filter posterlink-crawler test`
  - Passed: 216 tests.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## Public Discovery Exposure Gate

Connected the approved Phase 1/3/5 output to public discovery surfaces after
user approval. This does not delete rows or change publication status; it only
keeps rows explicitly computed as `exposure_tier = 'C'` out of public feeds.
Rows with `exposure_tier IS NULL` remain visible so local or not-yet-backfilled
environments do not go blank.

- Added shared web helper:
  - `apps/web/lib/publicPosterVisibility.ts`
- Updated public web surfaces to exclude tier C:
  - home feed and urgent feed
  - home summary counts
  - public institution poster counts and institution detail poster lists
  - sitemap poster URLs
  - semantic-search response safety filter
- Added migration:
  - `supabase/migrations/20260825030000_gate_public_discovery_by_exposure_tier.sql`
  - Updates `search_public_posters`, `count_public_posters`,
    `match_posters_by_embedding`, and `get_recommended_posters_v2`.
- Operating DB migration apply:
  - Dry-run showed exactly one pending migration:
    `20260825030000_gate_public_discovery_by_exposure_tier.sql`
  - Applied with:
    `pnpm dlx supabase db push --project-ref zxndgzsfrgwahwsdbjdj`
  - Follow-up dry-run reported the remote DB is up to date.
- Operating DB verification:
  - Published posters: 537.
  - Published tier A: 191.
  - Published tier B: 3.
  - Published tier C: 343.
  - Published tier null: 0.
  - `count_public_posters(..., p_include_closed=false)`: 105.
  - Equivalent direct visible-active query: 105.
  - `count_public_posters(..., p_include_closed=true)`: 194.

Validation:

- `pnpm --filter web lint`
  - Passed.
- `pnpm --filter posterlink-crawler test`
  - Passed: 216 tests.
- `pnpm --filter web build`
  - Passed.
- `git diff --check`
  - Passed, with existing Windows CRLF normalization warnings only.

## Phase 2 Stratified Golden Set Package

Prepared the next Phase 2 human-review package. No operating DB writes were
performed.

- Improved `create-extraction-golden-seed.js`.
  - Default strategy is now `stratified`.
  - `--strategy=newest` keeps the old latest-first behavior.
  - `--pool-size` controls how many recent operating rows are considered before
    selecting the final review sample.
  - Source excerpts are truncated by Unicode code point to avoid splitting emoji
    surrogate pairs.
- Generated a 120-poster stratified seed:
  `pnpm eval:sample -- --limit=120 --pool-size=1000 --output=data/eval/extraction-golden-seed-20260825-stratified.json`
  - Pool size: 598.
  - Evidence rows read: 5118.
  - Sample buckets:
    - normal recruit: 60.
    - low-confidence/visual uncertainty: 36.
    - non-recruit or rejected: 16.
    - duplicate suspected: 8.
    - text or missing visual: 0 available in the current pool.
- Split the seed into reviewer batches:
  `pnpm eval:review-batches -- --input=data/eval/extraction-golden-seed-20260825-stratified.json --output-dir=data/eval/review-batches-20260825 --batch-size=20`
  - Batch count: 6.
  - Batch size: 20.
- Checked current golden-label commands:
  - `pnpm eval:validate -- --set=eval/golden`
    - Passed with 0 files / 0 labels.
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-current-empty-or-labeled-20260825.json`
    - Passed and emitted the expected empty-label report.

Remaining human step:

- Review the six generated batch JSON files, fill checked `truth` values, and
  place completed labels under `eval/golden/` before threshold calibration.

## Phase 2 Weekly Evaluation Workflow

Added CI support for the Phase 2 extraction evaluation harness. No operating DB
writes were performed.

- Added `.github/workflows/ai-extraction-eval.yml`.
  - Runs weekly on Monday 03:00 KST.
  - Supports manual `workflow_dispatch`.
  - Runs on PRs that change golden labels or the evaluator.
  - Always validates `eval/golden` JSON shape.
  - Scores current `poster_field_evidence` against labels only when Supabase
    secrets are available.
  - Uploads the evaluation report artifact for 30 days.
- Updated `docs/ai_extraction_evaluation.md` with the CI behavior.

## Phase 2 Label Progress Status Command

Added a local progress report for the Phase 2 golden-label workflow. No
operating DB reads or writes are required.

- Added `scripts/crawler/src/summarize-extraction-golden.js`.
  - Reads the generated seed, review batch files, and `eval/golden`.
  - Reports target count, completed unique poster count, remaining count,
    sample-bucket distribution, field-level label counts, and least-labeled
    fields.
- Added commands:
  - `pnpm --filter posterlink-crawler eval:status`
  - `pnpm eval:status`
- Current report:
  - Target: 120.
  - Labeled unique posters under `eval/golden`: 0.
  - Remaining: 120.
  - Review batches: 6 files / 120 items.
- Updated `docs/ai_extraction_evaluation.md` with the status command.
