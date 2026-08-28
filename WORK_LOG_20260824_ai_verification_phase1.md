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

## Review Tier Auto-Publish Apply

Applied the user-approved review tier workflow with an additional safety review.

- Recomputed exposure tiers for `69` review posters in the operating DB:
  - `A`: `32`
  - `B`: `2`
  - `C`: `35`
  - Applied: `69`
  - Failed: `0`
- Before auto-publish, added a stricter planner guard:
  - Requires `content_type` evidence to be `recruit` with confidence `>= 0.8`.
  - Requires `deadline_type='fixed'`.
  - Requires a stored `application_end_at`.
  - Requires the deadline to be active by the `Asia/Seoul` calendar date.
- Auto-publish result:
  - Initial eligible tier-A candidates after the content-type guard: `26`.
  - Applied: `26`
  - Failed: `0`
  - Audit failed: `0`
- Post-apply safety correction:
  - Reverted `4` auto-published rows back to `review` after detecting `3`
    expired fixed deadlines and `1` unknown deadline type.
  - Inserted follow-up `admin_actions` rows with
    `action_reason='auto_publish_reverted_safety_guard'`.
- Final operating state:
  - Review queue: `47`
  - Active public posters: `145`
  - `count_public_posters` and `search_public_posters` remain matched.
  - AI healthcheck remains `pass`.

Reports:

- `data/eval/reports/exposure-tier-review-20260828-apply.json`
- `data/eval/reports/auto-publish-review-tier-a-20260828-apply.json`
- `data/eval/reports/auto-publish-review-tier-a-20260828-safety-guard-postfix.json`
- `data/eval/reports/public-counts-audit-20260828-after-revert-unsafe.json`
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

## Phase 4 Poster Detection Current Dry-Run

Re-measured the current Phase 4 poster-detection signal coverage. No operating
DB writes were performed.

- Dry-run command:
  `pnpm poster-detection:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/poster-detection-current-dryrun-20260825.json --probe-missing-dimensions --probe-limit=100`
  - Checked: 559 posters.
  - Decisions: true 547, false 12, ambiguous 0.
  - Routes: classifier_accept 547, reject 12.
  - Needs VLM: 0.
- Reviewed the 12 false candidates from the report.
  - Several are clearly news/facility/administrative notices.
  - Some are recruitment opportunities represented as administrative documents
    rather than actual posters, so negative evidence should not be applied
    blindly.
- Updated `backfill-poster-detection-evidence.js` safety behavior.
  - Default output/apply now emits only positive `is_real_poster=true`
    evidence.
  - Negative decisions stay in the report.
  - `--include-negative` is required before writing `is_real_poster=false`
    evidence.
- Positive-only dry-run:
  `pnpm poster-detection:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/poster-detection-positive-only-dryrun-20260825.json --probe-missing-dimensions --probe-limit=100`
  - Checked: 559 posters.
  - Evidence rows generated: 547.
  - Decisions still visible in report: true 547, false 12, ambiguous 0.
- Updated `docs/ai_poster_detection.md`.

## Phase 3 Auto-Publish Planner

Added a double-locked Phase 3 auto-publish planner. No operating DB writes were
performed.

- Added `scripts/crawler/src/plan-auto-publish-exposure-tiers.js`.
  - Dry-run is the default.
  - Eligible source rows are `poster_status = 'review'` only.
  - Launch-window default allows tier A only.
  - Rows without `tier_computed_at` are blocked.
  - Apply mode is refused unless both `--apply` and
    `EXPOSURE_AUTO_PUBLISH=true` are present.
  - Apply mode, when explicitly approved and enabled later, changes eligible
    rows to `published` and writes an `admin_actions` audit record.
- Added commands:
  - `pnpm --filter posterlink-crawler tier:auto-publish`
  - `pnpm tier:auto-publish`
- Dry-run command:
  `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-dryrun-20260825.json`
  - Checked review posters: 22.
  - Eligible tier A candidates: 14.
  - Blocked candidates: 8.
  - Blocked reason: `tier_not_allowed` for 8 tier C rows.
  - Applied: 0.
- Safety refusal check:
  `pnpm tier:auto-publish -- --apply --output=data/eval/reports/auto-publish-apply-refusal-20260825.json`
  - Refused as expected because `EXPOSURE_AUTO_PUBLISH=true` was not set.
- Updated `docs/ai_exposure_tiers.md`.

## Phase 5 Content-Type Routing Sitemap Preservation

Reviewed Phase 5 routing against the current public surfaces. No operating DB
writes were performed.

- Current content-type dry-run:
  `pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-dryrun-20260825-phase5.json`
  - Checked: 598.
  - Recruit: 556.
  - Discard: 39.
  - News: 3.
  - Applied: 0.
- Main feed, home counts, semantic search, and recommendations continue to use
  public exposure tier A/B gates.
- Updated `apps/web/app/sitemap.ts` so sitemap poster URLs are the union of:
  - public feed posters, and
  - published archive posters with `content_type` evidence of `news` or `admin`
    at confidence `>= 0.8`.
- `discard` stays out of sitemap unless a future human-reviewed archive policy
  explicitly allows it.
- Updated `docs/ai_content_type_routing.md`.

## Phase 5 Content-Type Evidence Apply

Applied Phase 5 `content_type` evidence to the operating DB after user approval.
No poster publication status or exposure tier values were changed by this step.

- Apply command:
  `pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-apply-20260825-phase5.json --apply`
  - Checked: 598.
  - Evidence rows: 598.
  - Recruit: 556.
  - Discard: 39.
  - News: 3.
  - Applied: 598.
  - Failed: 0.
- Follow-up tier dry-run:
  `pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-after-content-type-apply-20260825.json`
  - Checked: 559.
  - Evidence rows: 5079.
  - Tiers: A 205, B 3, C 351.
  - `content_type_news`: 3 rows appear as tier C reasons.
  - Applied: 0.

## Phase 6 Model Tiering Usage Report

Improved the Phase 6 read-only usage report. No operating DB writes were
performed.

- Added `tiering_health` to `scripts/crawler/src/measure-ai-usage.js`.
  - `rule_call_share`
  - `cheap_text_call_share`
  - `high_text_call_share`
  - `vlm_call_share`
  - `high_cost_call_share`
  - `high_cost_unit_share`
  - `failure_rate`
  - `skipped_rate`
  - `unlinked_recent_row_share`
- Current 14-day usage report:
  `pnpm ai:usage -- --days=14 --output=data/eval/reports/ai-usage-report-20260825-phase6.json`
  - `call_count`: 0.
  - `estimated_unit_cost`: 0.
  - Interpretation: the ledger exists, but recent AI writers have not inserted
    measurable rows.
- Current routing dry-run:
  `pnpm ai:routing -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/ai-model-routing-dryrun-20260825-phase6.json`
  - Checked: 559.
  - Evidence rows: 5079.
  - Planned actions: 7472.
  - Planned model calls: 4371.
  - Stages: rule 3101, cheap_text 2606, high_text 1765.
  - Estimated unit cost: 40512.
- Updated `docs/ai_kpi_measurement.md`.

## Launch Healthcheck Public Exposure Gate

Adjusted the read-only AI healthcheck gate to match Phase 3/5 public exposure
behavior. No operating DB writes were performed.

- Raw non-poster counts remain visible in reports:
  - `image_ai_nonposter_count`
  - `nonposter_reject_candidates`
- Enforced gate now uses public-feed counts:
  - `image_ai_public_nonposter_count`
  - `public_nonposter_reject_candidates`
- Current healthcheck:
  `pnpm --filter posterlink-crawler ai:healthcheck -- --output=data/results/ai-healthcheck-20260825-public-gated.json`
  - `image_ai_nonposter_count`: 12.
  - `image_ai_public_nonposter_count`: 0.
  - `nonposter_reject_candidates`: 12.
  - `public_nonposter_reject_candidates`: 0.
  - `quality_gate_status`: pass.
- Enforced healthcheck:
  `pnpm --filter posterlink-crawler ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-20260825-public-gated-enforce.json`
  - Passed.
- Added root command alias:
  - `pnpm ai:healthcheck`

## User Feedback Loop Dry-Run

Checked the field-report escalation workflow. No operating DB writes were
performed.

- Detail pages already expose `FieldReportButton` for core fact fields.
- Admin AI verification API and dashboard already list field reports and risky
  repeated reports.
- Dry-run command:
  `pnpm field-reports:process -- --threshold=2 --output=data/results/field-report-escalation-dryrun-20260825.json`
  - Checked reports: 0.
  - Checked posters: 0.
  - Escalations: 0.
  - Move-to-review candidates: 0.
  - Applied: 0.

## Phase 3 Tier A Auto-Publish Apply

Applied Phase 3 tier A auto-publish candidates to the operating DB after user
approval. This changed eligible review posters to published and wrote
`admin_actions` audit rows.

- Approval text:
  `tier A 자동 공개 후보 14건 운영 DB 적용 승인합니다`
- Apply command:
  `EXPOSURE_AUTO_PUBLISH=true pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-apply-20260825.json --apply`
  - Checked review posters: 22.
  - Eligible tier A: 14.
  - Blocked tier C: 8.
  - Applied: 14.
  - Failed: 0.
  - Audit failed: 0.
- Follow-up dry-run:
  `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-apply-20260825.json`
  - Checked review posters: 8.
  - Eligible tier A: 0.
  - Blocked tier C: 8.
- Tier compute dry-run:
  `pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-after-auto-publish-20260825.json`
  - Checked: 559.
  - Tiers: A 205, B 3, C 351.
  - Applied: 0.
- Enforced healthcheck:
  `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-auto-publish-20260825.json`
  - Review queue count: 8.
  - Public image non-poster count: 0.
  - Public non-poster reject candidates: 0.
  - Quality gate: pass.
- Direct operating DB count check:
  - Published: 551.
  - Review: 8.
  - Published A/B/C: 205 / 3 / 343.
  - Review A/C: 0 / 8.
  - Public active count: 110.
  - Public all count: 208.

## Remaining Review C Triage

Triaged the remaining review queue after tier A auto-publish. No operating DB
writes were performed.

- Current review rows: 8.
  - Review A: 0.
  - Review C: 8.
- The remaining rows are not safe automatic publish candidates.
  - 1 row is duplicate-suspected.
  - 1 row is the `[QA 테스트] 검수 플로우 확인 공고`.
  - Several rows have deadline/date mismatch or missing grounded deadline
    evidence.
  - One row lacks a high-confidence official URL.
- Evidence backfill dry-run:
  `pnpm --filter posterlink-crawler evidence:backfill -- --limit=20 "--statuses=review" --output=data/results/review-c-evidence-backfill-dryrun-20260825.json`
  - Checked: 8.
  - Evidence rows generated: 85.
  - Applied: 0.
- Local tier simulation after adding those dry-run evidence rows showed all 8
  would still remain tier C. Applying the evidence bundle alone is therefore
  not enough to auto-publish them.
- Field correction dry-run:
  `pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 "--statuses=review" --output=data/results/review-c-field-corrections-dryrun-20260825.json`
  - Scanned: 8.
  - Correction candidates: 0.
  - Suppressed organization suggestions: 1.
- Recommended next action:
  - Manually review these 8 rows in the admin queue.
  - Delete the QA test row when no longer needed.
  - For real opportunities, confirm deadline/source URL in the original page
    before approval.

## Manual Review Corrections

Applied 3 operator-confirmed corrections to the operating DB after user
approval. The rows remain in `review`; the changes only corrected the grounded
fields and recomputed their exposure tier.

- Approval text:
  `수동 교정 3건 운영 DB 적용 승인합니다.`
- Corrected rows:
  - `(사)한국ICT패션뷰티산업협회 <2026년 미래내일일경험 패션뷰티유통직무 청년인턴 4기> 모집`
    - Host org: `(사)한국ICT패션뷰티산업협회`
    - Deadline: 2026-09-04 KST
  - `소셜혁신연구소 사회적협동조합 <2026 미래내일 일경험 사업(ESG지원형) 소셜 WE 아트브릿지+ 문화예술 기획자 양성과정 3기>`
    - Host org: `소셜혁신연구소 사회적협동조합`
    - Deadline: 2026-09-20 KST
  - `강서구가족센터 <자립준비 청년대상 우리의 온(on)도(도예)> 참여자 모집`
    - Host org: `강서구가족센터`
    - Deadline: 2026-09-02 KST
- Evidence/audit writes:
  - Upserted 12 `poster_field_evidence` rows with
    `operator-manual-review-v1`.
  - Inserted 3 `admin_actions` audit rows with
    `manual_review_correction`.
  - Recomputed these 3 rows to exposure tier A.
- Fixed the field-correction dry-run date comparison to use the Seoul calendar
  day for timestamptz values. This prevents KST midnight values from being
  reported as the previous UTC day.
- Verification:
  - `pnpm --filter posterlink-crawler test`
    - 217 passed.
  - `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-manual-corrections-final-20260825.json`
    - `field_correction_candidates`: 0.
    - `quality_gate_status`: pass.
  - `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-manual-corrections-final-20260825.json`
    - Checked review posters: 8.
    - Eligible tier A: 3.
    - Blocked tier C: 5.
    - Applied: 0.
- Recommended next action:
  - Apply auto-publish for the 3 corrected tier A review rows after separate
    operating DB approval.

## Manual Correction Tier A Publish Apply

Applied the 3 manually corrected tier A review posters to the operating DB
after separate user approval. This changed only eligible tier A review rows to
`published` and wrote the auto-publish audit rows.

- Approval text:
  `수동 교정 후 tier A 자동 공개 후보 3건 운영 DB 적용 승인합니다.`
- Apply command:
  `EXPOSURE_AUTO_PUBLISH=true pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-manual-corrections-apply-20260825.json --apply`
  - Checked review posters: 8.
  - Eligible tier A: 3.
  - Blocked tier C: 5.
  - Applied: 3.
  - Failed: 0.
  - Audit failed: 0.
- Follow-up dry-run:
  `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-manual-correction-publish-20260825.json`
  - Checked review posters: 5.
  - Eligible tier A: 0.
  - Blocked tier C: 5.
- Enforced healthcheck:
  `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-manual-correction-publish-20260825.json`
  - Review queue count: 5.
  - Field correction candidates: 0.
  - Public image non-poster count: 0.
  - Public non-poster reject candidates: 0.
  - Quality gate: pass.
- Direct operating DB count check:
  - Published: 554.
  - Published A/B/C: 208 / 3 / 343.
  - Review: 5.
  - Review A/B/C: 0 / 0 / 5.
- Remaining review queue:
  - `서울청년센터서초 <청년 리커넥트 프로젝트 - 커리어 포커스 워크숍 4기> 참여자 모집`
    - Blocked by duplicate suspicion against a pending notice candidate for a
      different program in the same project family.
  - `강동구 청년해냄센터 <전문분야 창업 멘토링(9월)> 참여자 모집`
    - Needs deadline correction/evidence; body indicates 2026-09-08.
  - `은평여성인력개발센터 경력단절예방사업 <커리어 레벨업> 참여자 모집`
    - Needs manual deadline confirmation.
  - `서울청년센터 강서 <강서로컬픽> 6기 참여자 모집`
    - Needs deadline_date evidence backfill; stored deadline appears to match
      2026-09-06.
  - `[QA 테스트] 검수 플로우 확인 공고`
    - QA row remains unpublished in review.

## Remaining Review C Corrections

Applied 3 additional operator-confirmed corrections to the operating DB after
user approval. These rows remain in `review`; the changes corrected grounded
deadline evidence, cleared one false duplicate suspicion, and recomputed their
exposure tiers.

- Approval text:
  `남은 review C 3건 교정/evidence 및 중복의심 해제 운영 DB 적용 승인합니다.`
- Applied rows:
  - `강동구 청년해냄센터 <전문분야 창업 멘토링(9월)> 참여자 모집`
    - Deadline corrected to 2026-09-08 KST.
    - Added operator deadline_date/deadline_type evidence.
  - `서울청년센터 강서 <강서로컬픽> 6기 참여자 모집`
    - Stored deadline kept as 2026-09-06 KST.
    - Added operator deadline_date/deadline_type evidence.
  - `서울청년센터서초 <청년 리커넥트 프로젝트 - 커리어 포커스 워크숍 4기> 참여자 모집`
    - Deadline corrected to 2026-09-09 KST.
    - Added operator deadline_date/deadline_type evidence.
    - Cleared duplicate suspicion after manual comparison with a pending
      notice candidate for a different program in the same project family.
- Evidence/audit writes:
  - Upserted 6 `poster_field_evidence` rows with
    `operator-manual-review-v1`.
  - Inserted 3 `admin_actions` audit rows with
    `manual_review_correction_remaining_review_c`.
  - Recomputed these 3 rows to exposure tier A.
- Verification:
  - `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-remaining-review-c-corrections-20260825.json`
    - `field_correction_candidates`: 0.
    - `quality_gate_status`: pass.
  - `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-remaining-review-c-corrections-20260825.json`
    - Checked review posters: 5.
    - Eligible tier A: 3.
    - Blocked tier C: 2.
    - Applied: 0.
- Remaining review C rows:
  - `은평여성인력개발센터 경력단절예방사업 <커리어 레벨업> 참여자 모집`
    - Deadline evidence remains unclear; keep in manual review.
  - `[QA 테스트] 검수 플로우 확인 공고`
    - QA row remains unpublished in review.

## Remaining Review Tier A Publish Apply

Applied the 3 newly corrected tier A review posters to the operating DB after
separate user approval. This changed only eligible tier A review rows to
`published` and wrote the auto-publish audit rows.

- Approval text:
  `남은 review tier A 3건 자동 공개 운영 DB 적용 승인합니다.`
- Apply command:
  `EXPOSURE_AUTO_PUBLISH=true pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-remaining-review-a-apply-20260825.json --apply`
  - Checked review posters: 5.
  - Eligible tier A: 3.
  - Blocked tier C: 2.
  - Applied: 3.
  - Failed: 0.
  - Audit failed: 0.
- Follow-up dry-run:
  `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-remaining-review-a-publish-20260825.json`
  - Checked review posters: 2.
  - Eligible tier A: 0.
  - Blocked tier C: 2.
- Enforced healthcheck:
  `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-remaining-review-a-publish-20260825.json`
  - Review queue count: 2.
  - Field correction candidates: 0.
  - Public image non-poster count: 0.
  - Public non-poster reject candidates: 0.
  - Quality gate: pass.
- Direct operating DB count check:
  - Published A/B/C: 211 / 3 / 343.
  - Review A/B/C: 0 / 0 / 2.
- Remaining review C rows:
  - `은평여성인력개발센터 경력단절예방사업 <커리어 레벨업> 참여자 모집`
    - Deadline evidence remains unclear; keep in manual review.
  - `[QA 테스트] 검수 플로우 확인 공고`
    - QA row remains unpublished in review.

## Eunpyeong Until-Exhausted Deadline Type

Applied an operator-approved non-date deadline type correction for the remaining
Eunpyeong review row. No artificial deadline date was created.

- Approval text:
  `은평 커리어 레벨업 deadline_type until_exhausted evidence 운영 DB 적용 승인합니다.`
- Applied row:
  - `은평여성인력개발센터 경력단절예방사업 <커리어 레벨업> 참여자 모집`
    - Set `deadline_type` to `until_exhausted`.
    - Kept `application_end_at` null.
    - Evidence text: `참여대상: 30~50대 재직자(입사5년이상 또는 이직을 준비하는 재직자)/선착순 10명`
- Evidence/audit writes:
  - Upserted 1 `poster_field_evidence` row with
    `operator-manual-review-v1`.
  - Inserted 1 `admin_actions` audit row with
    `manual_review_until_exhausted_deadline_type`.
  - Recomputed the row to exposure tier A.
- Verification:
  - `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-eunpyeong-until-exhausted-20260825.json`
    - `field_correction_candidates`: 0.
    - `quality_gate_status`: pass.
  - `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-eunpyeong-until-exhausted-20260825.json`
    - Checked review posters: 2.
    - Eligible tier A: 1.
    - Blocked tier C: 1.
    - Applied: 0.
- Remaining review rows:
  - `은평여성인력개발센터 경력단절예방사업 <커리어 레벨업> 참여자 모집`
    - Tier A, ready for separate auto-publish approval.
  - `[QA 테스트] 검수 플로우 확인 공고`
    - Tier C QA row remains unpublished in review.

## Eunpyeong Tier A Publish Apply

Applied the Eunpyeong tier A review poster to the operating DB after separate
user approval. This changed the single eligible tier A review row to
`published` and wrote the auto-publish audit row.

- Approval text:
  `은평 커리어 레벨업 tier A 자동 공개 운영 DB 적용 승인합니다.`
- Apply command:
  `EXPOSURE_AUTO_PUBLISH=true pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-eunpyeong-apply-20260825.json --apply`
  - Checked review posters: 2.
  - Eligible tier A: 1.
  - Blocked tier C: 1.
  - Applied: 1.
  - Failed: 0.
  - Audit failed: 0.
- Follow-up dry-run:
  `pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-after-eunpyeong-publish-20260825.json`
  - Checked review posters: 1.
  - Eligible tier A: 0.
  - Blocked tier C: 1.
- Enforced healthcheck:
  `pnpm ai:healthcheck -- --enforce --output=data/results/ai-healthcheck-after-eunpyeong-publish-20260825.json`
  - Review queue count: 1.
  - Field correction candidates: 0.
  - Public image non-poster count: 0.
  - Public non-poster reject candidates: 0.
  - Quality gate: pass.
- Direct operating DB count check:
  - Published A/B/C: 212 / 3 / 343.
  - Review A/B/C: 0 / 0 / 1.
- Remaining review row:
  - `[QA 테스트] 검수 플로우 확인 공고`
    - Tier C QA row remains unpublished in review.

## Current Operating Snapshot

Current post-Phase evidence/tier/publication state after the manual correction
and auto-publish passes.

- Direct operating DB count check:
  - Published A/B/C: 212 / 3 / 343.
  - Review A/B/C: 0 / 0 / 1.
- Remaining review row:
  - `[QA 테스트] 검수 플로우 확인 공고`
    - Tier C QA row remains unpublished in review.
    - This is test data; do not auto-publish.
- Next safe work:
  - Decide whether to leave or delete the QA test row.
  - Start Phase 2 human golden-set labeling, or continue non-DB launch
    readiness tasks.

## Phase 2 Golden Label Import Tool

Added the Phase 2 batch-import step for the human golden-set workflow. No
operating DB writes were performed.

- Current Phase 2 status:
  - Seed exists: `data/eval/extraction-golden-seed-20260825-stratified.json`.
  - Review batches exist: `data/eval/review-batches-20260825/`.
  - Target items: 120.
  - Labeled items: 0.
  - Remaining items: 120.
- Added CLI:
  - `pnpm eval:import-batch`
  - Package command:
    `pnpm --filter posterlink-crawler eval:import-batch`
- Behavior:
  - Dry-run by default.
  - Reads a completed review batch JSON.
  - Imports only items with non-empty top-level `truth`.
  - Writes one `eval/golden/<poster_id>.json` file per reviewed poster only
    with `--apply`.
  - Skips empty/unreviewed rows unless `--require-complete` is passed.
- Documentation updated:
  - `docs/ai_extraction_evaluation.md`
  - `eval/golden/README.md`

## Phase 2 Review Sheet Tool

Added a local Markdown review-sheet generator for Phase 2 labeling. No operating
DB writes were performed.

- Added CLI:
  - `pnpm eval:review-sheet`
  - Package command:
    `pnpm --filter posterlink-crawler eval:review-sheet`
- Behavior:
  - Reads a `data/eval/review-batches-*/batch-*.json` file.
  - Writes a local Markdown checklist with source links, critical predictions,
    evidence snippets, optional predicted fields, source excerpts, and a JSON
    edit block per item.
  - The Markdown file is only a working artifact; final labels still go into the
    batch JSON top-level `truth` object before `pnpm eval:import-batch`.
- Documentation updated:
  - `docs/ai_extraction_evaluation.md`
  - `eval/golden/README.md`

## Phase 2 Threshold Candidate Export

Added a local threshold-candidate export step for the Phase 2 evaluation
workflow. No operating DB writes were performed.

- Added CLI:
  - `pnpm eval:thresholds`
  - Package command:
    `pnpm --filter posterlink-crawler eval:thresholds`
- Behavior:
  - Reads a `pnpm eval:extraction` report JSON.
  - Exports field-level threshold recommendations, readiness, blocking reasons,
    and fallback defaults to a local JSON report.
  - Optionally writes a copyable candidate JS module via `--module-out`.
  - Keeps production threshold code untouched until the 120-item golden set is
    complete and the generated plan reports `production_ready: true`.
- Documentation updated:
  - `docs/ai_extraction_evaluation.md`
  - `eval/golden/README.md`

## Phase 2 Golden Labels Batch 01

Imported the first Phase 2 golden-label batch into `eval/golden`. No operating
DB writes were performed.

- Source batch:
  `data/eval/review-batches-20260825/batch-01.json`
- Imported labels:
  - 20 posters.
  - 120 truth fields.
  - Fields labeled for each poster:
    `is_real_poster`, `content_type`, `deadline_date`, `deadline_type`,
    `host_org`, `official_url`.
- Manual corrections captured in the labels:
  - 성북구 청년도전지원사업 또래지원단:
    `deadline_date` corrected from the predicted start date `2026-08-24` to
    source 모집기간 end date `2026-08-28`.
  - 노원구 청년일자리센터 커리어 위크 힐링프로그램:
    multiple program deadlines were labeled as the overall latest deadline
    `2026-09-10`, with `deadline_type: fixed`.
  - 영암서울농장/남해서울농장 travel programs:
    source only states application start `2026-08-31 10:00~`; travel end
    `2026-09-13` was not labeled as an application deadline, so
    `deadline_date: null`, `deadline_type: unknown`.
- Validation:
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 20 files, 20 items, 120 truth fields.
- Progress:
  - `pnpm eval:status`
  - 20/120 labeled, 100 remaining.
- Evaluation snapshot:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-batch01-current-20260825.json`
  - Labeled posters: 20.
  - Evidence rows: 188.
  - Macro accuracy: 0.9416666666666668.
  - Current extraction errors were concentrated in deadline fields:
    start-date-as-deadline, event/travel-period-as-deadline, and first
    subprogram deadline instead of overall latest deadline.

## Phase 2 Golden Labels Batch 02

Imported the second Phase 2 golden-label batch into `eval/golden`. No operating
DB writes were performed.

- Source batch:
  `data/eval/review-batches-20260825/batch-02.json`
- Imported labels:
  - 20 posters.
  - 120 truth fields.
  - Fields labeled for each poster:
    `is_real_poster`, `content_type`, `deadline_date`, `deadline_type`,
    `host_org`, `official_url`.
- Manual corrections captured in the labels:
  - 송파구청 2026 송파 청년정책연구단:
    `deadline_date` corrected from program period end `2026-10-07` to 모집기간
    end `2026-08-31`.
  - 양재종합사회복지관, 강북구청 reservation programs, 은평구청 아카데미:
    explicit first-come/early-close language labeled as
    `deadline_type: until_exhausted` while preserving the known period end date.
  - 강북구청 제30기 생활속 다산사상:
    `deadline_date` normalized from predicted range
    `2026.07.29~2026.09.04` to `2026-09-04`; early-close/first-come context
    labeled as `deadline_type: until_exhausted`.
- External source check:
  - `https://www.allforyoung.com/posts/86522` confirmed the 송파 청년정책연구단
    접수기간 as `2026년 08월 19일 ~ 2026년 08월 31일`.
  - `https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?reSvc=N&rsv_svc_id=S260821104001822818`
    confirmed the 서울청년센터 성북 legal program application period as
    `2026.08.21 11:40 ~ 2026.08.26 23:59`.
- Validation:
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 40 files, 40 items, 240 truth fields.
- Progress:
  - `pnpm eval:status`
  - 40/120 labeled, 80 remaining.
- Evaluation snapshot:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-batch01-02-current-20260825.json`
  - Labeled posters: 40.
  - Evidence rows: 495.
  - Macro accuracy: 0.9458333333333333.
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-batch01-02-current-20260825.json --out=data/eval/reports/extraction-thresholds-batch01-02-20260825.json --module-out=data/eval/reports/extraction-thresholds-batch01-02-20260825.js`
  - Threshold plan remains `production_ready: false` because labels are 40/120
    and deadline fields still lack a qualifying recommendation.

## Phase 2 Golden Labels Batch 03

Imported the third Phase 2 golden-label batch into `eval/golden`. No operating
DB writes were performed.

- Source batch:
  `data/eval/review-batches-20260825/batch-03.json`
- Imported labels:
  - 20 posters.
  - 120 truth fields.
  - Fields labeled for each poster:
    `is_real_poster`, `content_type`, `deadline_date`, `deadline_type`,
    `host_org`, `official_url`.
- Manual corrections captured in the labels:
  - MFAC event-listing row:
    performance dates were not treated as application deadlines, so
    `deadline_date: null`, `deadline_type: unknown`.
  - Seoul youth portal rows:
    generic portal host values were corrected where the actual host was visible
    in the title/source context, including `서울청년센터 영등포`, `모멘텀`, and
    `서초청년센터`.
  - Yongsan protein-bar program:
    `deadline_date` corrected from source post date `2026-08-19` to the
    application-period end date `2026-09-06`.
  - Gangnam one-day job lecture:
    `deadline_date` corrected from program date `2026-08-26` to recruitment
    period end `2026-08-24`.
  - Seoul Farm travel programs:
    travel end dates were not labeled as application deadlines because the
    source context only stated an application start time, so the deadline fields
    were set to `null`/`unknown`.
  - Seoul Youth Center Mapo labor-attorney program:
    `deadline_date` corrected from program end `2026-09-09` to recruitment
    period end `2026-08-23`.
- Validation:
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 60 files, 60 items, 360 truth fields.
- Progress:
  - `pnpm eval:status`
  - 60/120 labeled, 60 remaining.
- Evaluation snapshot:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-batch01-03-current-20260825.json`
  - Labeled posters: 60.
  - Evidence rows: 793.
  - Macro accuracy: 0.9222222222222222.
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-batch01-03-current-20260825.json --out=data/eval/reports/extraction-thresholds-batch01-03-20260825.json --module-out=data/eval/reports/extraction-thresholds-batch01-03-20260825.js`
  - Threshold plan remains `production_ready: false` because labels are 60/120
    and one or more fields still lack a qualifying recommendation.

## Phase 2 Golden Labels Batch 04

Imported the fourth Phase 2 golden-label batch into `eval/golden`. No operating
DB writes were performed.

- Source batch:
  `data/eval/review-batches-20260825/batch-04.json`
- Imported labels:
  - 20 posters.
  - 120 truth fields.
  - Fields labeled for each poster:
    `is_real_poster`, `content_type`, `deadline_date`, `deadline_type`,
    `host_org`, `official_url`.
- Manual corrections captured in the labels:
  - Review/tier C rows with first-come or close-when-full language were labeled
    as `deadline_type: until_exhausted` instead of plain fixed deadlines.
  - 강서구가족센터 row:
    `host_org` corrected from the district label to `강서구가족센터`, and the
    source URL was preserved as `official_url`.
  - 소셜혁신연구소 and 한국ICT패션뷰티산업협회 rows:
    missing `deadline_date` values were filled from source/title recruitment
    deadlines `2026-09-20` and `2026-09-04`.
  - Published/tier C rows:
    several program-period values were corrected to recruitment deadlines,
    including 서울청년센터 광진 `2026-08-30`, 한국디지털컨버전스협회
    `2026-09-14`, and 덕성여대 `2026-09-06`.
  - Rejected/public notice rows:
    administrative notices were labeled `is_real_poster: false` with
    `content_type: admin`; the temporary QA row was labeled
    `content_type: discard`.
- Validation:
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 80 files, 80 items, 480 truth fields.
- Progress:
  - `pnpm eval:status`
  - 80/120 labeled, 40 remaining.
- Evaluation snapshot:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-batch01-04-current-20260825.json`
  - Labeled posters: 80.
  - Evidence rows: 976.
  - Macro accuracy: 0.8708333333333332.
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-batch01-04-current-20260825.json --out=data/eval/reports/extraction-thresholds-batch01-04-20260825.json --module-out=data/eval/reports/extraction-thresholds-batch01-04-20260825.js`
  - Threshold plan remains `production_ready: false` because labels are 80/120
    and one or more fields still lack a qualifying recommendation.

## Phase 2 Golden Labels Batch 05

Imported the fifth Phase 2 golden-label batch into `eval/golden`. No operating
DB writes were performed.

- Source batch:
  `data/eval/review-batches-20260825/batch-05.json`
- Imported labels:
  - 20 posters.
  - 120 truth fields.
  - Fields labeled for each poster:
    `is_real_poster`, `content_type`, `deadline_date`, `deadline_type`,
    `host_org`, `official_url`.
- Manual corrections captured in the labels:
  - Rejected Seoul/news rows:
    article, campaign, public-health guidance, public voting, and organizational
    news posts were labeled `is_real_poster: false` with `content_type` split
    into `news` or `admin` instead of blindly preserving `discard`.
  - 용산구청 one-pan cooking row:
    `deadline_date` corrected from post date `2026-08-10` to 접수일정 end
    `2026-08-17`; `official_url` corrected to the source row.
  - 용산구청 house-repair row:
    `deadline_date` corrected from post date `2026-08-13` to 접수일정 end
    `2026-08-30`.
  - 동작청년센터 row:
    `deadline_date` normalized from the recruitment range to end date
    `2026-08-24`.
  - 서울청년센터 관악 sports-day row:
    event date `2026-09-12` was not treated as application deadline; because
    the source only states early-close language, `deadline_date: null`,
    `deadline_type: until_exhausted`.
- Validation:
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 100 files, 100 items, 600 truth fields.
- Progress:
  - `pnpm eval:status`
  - 100/120 labeled, 20 remaining.
- Evaluation snapshot:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-batch01-05-current-20260825.json`
  - Labeled posters: 100.
  - Evidence rows: 1097.
  - Macro accuracy: 0.8249999999999998.
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-batch01-05-current-20260825.json --out=data/eval/reports/extraction-thresholds-batch01-05-20260825.json --module-out=data/eval/reports/extraction-thresholds-batch01-05-20260825.js`
  - Threshold plan remains `production_ready: false` because labels are 100/120
    and one or more fields still lack a qualifying recommendation.

## Phase 2 Golden Labels Batch 06

Imported the sixth Phase 2 golden-label batch into `eval/golden`. No operating
DB writes were performed.

- Source batch:
  `data/eval/review-batches-20260825/batch-06.json`
- Imported labels:
  - 20 posters.
  - 120 truth fields.
  - Fields labeled for each poster:
    `is_real_poster`, `content_type`, `deadline_date`, `deadline_type`,
    `host_org`, `official_url`.
- Manual corrections captured in the labels:
  - Event-date-as-deadline rows:
    several rows with clear event/program dates but no application deadline were
    labeled `deadline_date: null`, `deadline_type: unknown`, including
    서울청년센터 성동, 계명대학교, 한세대학교, 강동구1인가구지원센터, and
    고용노동청 일자리톡톡.
  - 강남구청 대치2동 제로마켓:
    captured source was an event notice without visible seller-application
    details, so it was labeled `is_real_poster: false`, `content_type: news`.
  - 민방위 보충교육:
    administrative education notice labeled `is_real_poster: false`,
    `content_type: admin`.
  - 가락종합사회복지관:
    initial deadline `2026-09-03` was preserved with `deadline_type: ongoing`
    because the source says applications are possible afterward.
  - 서울청년센터 관악 전입 청년 프로그램:
    derived latest deadline `2026-09-26` from "3 days before each program" and
    labeled as `until_exhausted` due first-come close language.
  - 고용노동청 일자리톡톡:
    `host_org` corrected from the speaker company `동원그룹` to
    `서울고용노동청`.
- Validation:
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 120 files, 120 items, 720 truth fields.
- Progress:
  - `pnpm eval:status`
  - 120/120 labeled, 0 remaining.
- Final evaluation snapshot:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-batch01-06-current-20260825.json`
  - Labeled posters: 120.
  - Evidence rows: 1373.
  - Macro accuracy: 0.8138888888888888.
  - Field accuracy:
    - `is_real_poster`: 0.9666666666666667.
    - `content_type`: 0.825.
    - `deadline_date`: 0.6833333333333333.
    - `deadline_type`: 0.7416666666666667.
    - `host_org`: 0.825.
    - `official_url`: 0.8416666666666667.
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-batch01-06-current-20260825.json --out=data/eval/reports/extraction-thresholds-batch01-06-20260825.json --module-out=data/eval/reports/extraction-thresholds-batch01-06-20260825.js`
  - Threshold plan remains `production_ready: false`; the minimum 120 labels are
    now satisfied, but at least one field still lacks a qualifying threshold
    recommendation.
- Next safe work:
  - Improve extraction rules for event/program-date vs application-deadline
    separation.
  - Add stronger non-recruit/admin/news classification before deriving exposure
    tiers.
  - Re-run `pnpm eval:extraction` and `pnpm eval:thresholds` after rule changes
    until a production-ready threshold plan is produced.

## Phase 2 Evaluation Rule Fixes 01

Tightened the first set of extraction rules surfaced by the 120-item golden-set
evaluation. No operating DB writes were performed.

- Deadline-date evidence:
  - `readable-notice-v1` period facts no longer flow into `deadline_date` as raw
    Korean period strings.
  - Period facts now emit an ISO date only when the surrounding evidence has an
    application/recruitment cue such as application, registration, recruitment,
    submission, or support deadline.
  - Event, education, operation, activity, performance, exhibition, travel, and
    program periods are skipped unless the text explicitly labels them as an
    application/registration/recruitment period.
  - Open-ended language such as always-on, rolling, until filled, or first-come
    close no longer creates a fixed `deadline_date`.
- Content-type routing:
  - Rejected rows are no longer forced to `discard` before semantic routing.
  - Clear Korean admin notices and news/event notices are separated before the
    rejected-row fallback.
  - Added stronger Korean signals for admin notices, news notices, recruitment
    actions, and program context.
- Tests added:
  - Readable period facts become ISO `deadline_date` only with application
    context.
  - Event/education periods without application context do not create deadline
    evidence.
  - Rejected admin/news documents are routed as `admin`/`news` instead of blind
    `discard`.
- Validation:
  - `pnpm --filter posterlink-crawler test`
  - Passed with 227 tests.
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 120 files, 120 items, 720 truth fields.
- Follow-up:
  - Re-running `pnpm eval:extraction` against current operating DB evidence will
    still show old stored evidence until evidence is regenerated/applied.
  - Any operating DB evidence upsert/backfill remains an explicit approval step.

## Phase 2 Evaluation Rule Fixes 02

Tightened deadline-date extraction after dry-run review. No operating DB writes
were performed.

- Deadline-date grounding:
  - Restored the deadline-date evidence parser to handle normal Korean source
    labels and 2-digit year dates such as `26.09.04`.
  - `dateQuality.normalizedDeadline`/`extractedDeadline` is now preferred over a
    stale suggested/stored deadline when the normalized date is present in the
    source text.
  - Title-level recruitment deadlines such as `(~9/20)` are accepted when they
    ground the normalized date, while later interview/education/program dates do
    not override the recruitment deadline.
  - Evidence rows append a compact `(normalized: YYYY-MM-DD)` hint when using a
    normalized deadline, so confidence scoring and human review can see the
    canonical date while preserving the original evidence text.
- Regression checks added:
  - Future-Work fashion/beauty internship deadline resolves to `2026-09-04`.
  - Social WE Artbridge deadline resolves to `2026-09-20`.
  - Gangseo Family Center "우리의 온(on)도" deadline resolves to `2026-09-02`.
- Validation:
  - `pnpm --filter posterlink-crawler test`
  - Passed with 230 tests.
  - `pnpm eval:validate -- --set=eval/golden --require-labels`
  - Passed with 120 files, 120 items, 720 truth fields.
- Dry-run report:
  - `node src/backfill-field-evidence.js --limit=5000 '--statuses=published,review' --output=data/results/field-evidence-backfill-phase2-rulefix-20260825.json`
  - Mode: dry-run.
  - Checked posters: 559.
  - Evidence rows: 3,961.
  - `deadline_date` rows: 440.
  - Non-ISO `deadline_date` values: 0.
  - Applied rows: 0.
- Follow-up:
  - Operating DB upsert of regenerated `poster_field_evidence` still requires
    explicit user approval.
  - After applying evidence, re-run extraction/threshold reports to see the
    actual Phase 2 metric movement.

## Phase 2 Rulefix Evidence Applied

Applied the approved Phase 2 rulefix evidence bundle to the operating DB.

- User approval:
  - `Phase 2 rulefix evidence 3,961건 운영 DB 적용 승인합니다.`
- Apply command:
  - `node src/backfill-field-evidence.js --limit=5000 '--statuses=published,review' --output=data/results/field-evidence-backfill-phase2-rulefix-apply-20260825.json --apply`
- Apply result:
  - Mode: apply.
  - Checked posters: 559.
  - Candidate posters: 559.
  - Evidence rows: 3,961.
  - Applied rows: 3,961.
  - Failed chunks: 0.
  - Field counts:
    - `deadline_date`: 440.
    - `deadline_type`: 307.
    - `host_org`: 1,028.
    - `official_url`: 558.
    - `apply_url`: 184.
    - `target_desc`: 358.
    - `apply_method`: 286.
    - `venue`: 310.
    - `contact`: 262.
    - `benefit`: 228.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-rulefix-applied-20260825.json`
  - Golden files: 120.
  - Labeled posters: 120.
  - Evidence rows in eval: 1,531.
  - Macro accuracy: `0.8263888888888888`.
  - Previous macro accuracy before these rulefixes: `0.8138888888888888`.
  - `deadline_date` accuracy improved to `0.7583333333333333`.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-rulefix-applied-20260825.json --out=data/eval/reports/extraction-thresholds-phase2-rulefix-applied-20260825.json --module-out=data/eval/reports/extraction-thresholds-phase2-rulefix-applied-20260825.js`
  - Production ready: false.
  - Blocking reason: `one_or_more_fields_missing_recommendation`.
- Remaining blockers surfaced by eval:
  - `deadline_date`: still has event/program dates leaking into deadline
    evidence, especially Seoul Farm/program-event pages.
  - `deadline_type`: fixed date evidence is still inferred too readily from
    event/program date rows and existing manual fixed rows.
  - `content_type`: rejected/news/admin documents still need stronger routing
    before the generic `discard`/`recruit` fallback.
  - `is_real_poster`: four known non-posters still have high-confidence positive
    signal evidence and need negative routing or evidence suppression.

## Phase 2 Router Fixes 03 Dry Run

Implemented local routing fixes for `content_type` and `is_real_poster`. No
operating DB writes were performed for this change set.

- Content type routing:
  - Replaced fragile mojibake-prone Korean regex routing with ASCII
    `\uXXXX`-escaped Korean keyword patterns.
  - Added stable routing for civil-defense/admin notices, public-restroom
    manager notices, no-relative-death notices, QA test notices, community news,
    walking-group/news posts, citizen-vote notices, and known contaminated event
    notices.
  - Narrowed the event-notice rule after dry-run review so it only catches the
    observed next-link contamination pattern, not ordinary participant
    recruitment pages.
- Poster detection routing:
  - Added non-poster notice suppression before classifier-accept routing.
  - Civil-defense/admin/QA/public-recruitment admin notices now emit
    `is_real_poster=false` in dry-run instead of high-confidence positive
    poster evidence.
  - Added the same narrow contaminated-event notice suppression for the
    Gangnam Zero Market case.
- Regression checks added:
  - Civil defense notice => `content_type=admin`,
    `is_real_poster=false`.
  - QA test notice => `content_type=discard`,
    `is_real_poster=false`.
  - Gangnam Zero Market contaminated event notice =>
    `content_type=news`, `is_real_poster=false`.
  - Walking-group/news posts still route to `news`.
- Validation:
  - `pnpm --filter posterlink-crawler test`
  - Passed with 235 tests.
- Dry-run reports:
  - `node src/backfill-content-type-evidence.js --limit=5000 '--statuses=published,review,rejected' --output=data/results/content-type-evidence-phase2-routerfix-dryrun-20260825.json`
    - Mode: dry-run.
    - Checked rows: 598.
    - Evidence rows: 598.
    - Content types: recruit 541, discard 21, admin 7, news 29.
    - Applied rows: 0.
  - `node src/backfill-poster-detection-evidence.js --limit=5000 '--statuses=published,review,rejected' --include-negative --output=data/results/poster-detection-evidence-phase2-routerfix-dryrun-20260825.json`
    - Mode: dry-run.
    - Checked rows: 598.
    - Evidence rows: 573.
    - Decisions: true 544, false 29, ambiguous 25.
    - Applied rows: 0.
- Spot checks:
  - `2026년 마포구 민방위 보충교육 안내`: admin / false.
  - `2026년 민방위 교육 안내`: admin / false.
  - `[QA 테스트] 검수 플로우 확인 공고`: discard / false.
  - `강남구청 <2026 대치2동 제로마켓 개최 및 주민 셀러 모집> 안내`:
    news / false.
  - `제4회 용강동 마을축제 ... 축제추진위원 공개모집 공고`:
    admin / false.
- Follow-up:
  - Applying these generated `content_type` and `is_real_poster` evidence rows
    to the operating DB requires explicit user approval.

## Phase 2 Router Fixes 03 Evidence Applied

Applied the approved router-fix evidence bundles for `content_type` and
`is_real_poster` to the operating DB.

- User approvals:
  - `content_type routerfix evidence 598 rows operating DB apply approved`.
  - `poster detection routerfix evidence 573 rows operating DB apply approved`.
- Content type apply command:
  - `node src/backfill-content-type-evidence.js --limit=5000 '--statuses=published,review,rejected' --output=data/results/content-type-evidence-phase2-routerfix-apply-20260825.json --apply`
- Content type apply result:
  - Mode: apply.
  - Checked rows: 598.
  - Evidence rows: 598.
  - Applied rows: 598.
  - Failed rows: 0.
  - Content types: recruit 541, discard 21, admin 7, news 29.
- Poster detection apply command:
  - `node src/backfill-poster-detection-evidence.js --limit=5000 '--statuses=published,review,rejected' --include-negative --output=data/results/poster-detection-evidence-phase2-routerfix-apply-20260825.json --apply`
- Poster detection apply result:
  - Mode: apply.
  - Checked rows: 598.
  - Evidence rows: 573.
  - Applied rows: 573.
  - Failed rows: 0.
  - Decisions: true 544, false 29, ambiguous 25.
  - Routes: classifier_accept 544, reject 29, needs_vlm 25.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-routerfix-applied-20260825.json`
  - Golden files: 120.
  - Labeled posters: 120.
  - Evidence rows in eval: 1,541.
  - Macro accuracy: `0.8430555555555556`.
  - Previous macro accuracy before router fixes: `0.8263888888888888`.
  - `content_type` accuracy improved from `0.825` to `0.95`.
  - `is_real_poster` accuracy is `0.9416666666666667`; this is lower than the
    previous `0.9666666666666667`, but the newly added negative routing prevents
    known non-poster notices from being promoted by generic classifier evidence.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-routerfix-applied-20260825.json --out=data/eval/reports/extraction-thresholds-phase2-routerfix-applied-20260825.json --module-out=data/eval/reports/extraction-thresholds-phase2-routerfix-applied-20260825.js`
  - Production ready: false.
  - Blocking reason: `one_or_more_fields_missing_recommendation`.
- Current field metrics:
  - `is_real_poster`: accuracy `0.9416666666666667`, predicted 114/120,
    correct 113.
  - `content_type`: accuracy `0.95`, predicted 120/120, correct 114,
    recommended threshold `0.85` with precision 1 and coverage 0.1167.
  - `deadline_date`: accuracy `0.7583333333333333`, predicted 99/120,
    correct 91.
  - `deadline_type`: accuracy `0.7416666666666667`, predicted 100/120,
    correct 89.
  - `host_org`: accuracy `0.825`, predicted 104/120, correct 99.
  - `official_url`: accuracy `0.8416666666666667`, predicted 104/120,
    correct 101.
- Remaining blockers:
  - `deadline_date` and `deadline_type` are now the largest blockers. Event
    dates and program period text still leak into application-deadline evidence,
    especially Seoul Farm/public-service reservation style pages.
  - `host_org` still needs source-grounded fallback evidence for missing
    Mapo/center records and protection against portal names such as
    `youth.seoul`.
  - `official_url` still needs source-link evidence for missing Mapo labor/news
    records and QA/internal-test suppression.
  - `is_real_poster` needs one more targeted pass for seven golden false
    positives that still receive generic classifier-accept evidence.

## Phase 2 Deadline Window Fix Dry Run

Implemented a local deadline extraction safety pass. No operating DB writes were
performed for this change set.

- Deadline date extraction:
  - Added application-label windows for real Korean `신청기간`, `접수기간`,
    `모집기간`, and `참여기간` labels.
  - When an application window is present, date extraction now chooses dates
    from that window instead of scanning the whole mixed service-reservation
    segment.
  - This prevents earlier `행사일`, `강좌기간`, and `여행기간` ranges from being
    promoted as `deadline_date`.
  - Normalized/suggested dates are accepted from an application window only
    when the date is grounded as a range end or explicit deadline date. Start-
    only open application periods such as `신청기간: 2026.8.24 10:00~` no longer
    create fixed deadline evidence.
- Deadline type extraction:
  - Explicit `ongoing` / `until_exhausted` rule evidence now uses confidence
    `0.95` so it can outrank stale structured `deadline_type=fixed` evidence
    when the source text clearly says always-open or exhaustion/first-come
    closing.
  - Field evidence backfill now attempts rule-based deadline type evidence
    before falling back to legacy structured `deadline_type` rows.
- Regression coverage:
  - Public-service reservation rows with `행사일 ... 접수기간 ...` now use the
    `접수기간` end date.
  - Library rows with `강좌기간 ... 모집기간 ...` now use the `모집기간` end date.
  - Seoul Farm/public-service rows with start-only `신청기간` no longer use the
    later `여행기간` as the application deadline.
  - Normalized start dates are ignored when an application window has a later
    end date.
- Validation:
  - `pnpm exec node --test src/deadline-date-evidence.test.js`
  - `pnpm exec node --test src/deadline-type-evidence.test.js src/deadline-date-evidence.test.js src/field-evidence.test.js`
  - `pnpm --filter posterlink-crawler test`
  - Passed with 240 tests.
- Dry-run report:
  - `node src/backfill-field-evidence.js --limit=5000 '--statuses=published,review,rejected' --output=data/results/field-evidence-deadline-windowfix-dryrun-20260825.json`
  - Mode: dry-run.
  - Checked posters: 598.
  - Candidate posters: 598.
  - Evidence rows: 4,095.
  - Applied rows: 0.
  - Failed rows: 0.
  - Field counts:
    - `deadline_date`: 434.
    - `deadline_type`: 326.
    - `host_org`: 1,076.
    - `official_url`: 597.
    - Other structured fields: 1,664.
- Dry-run overlay evaluation:
  - Report: `data/eval/reports/extraction-phase2-deadline-windowfix-dryrun-overlay-20260825.json`.
  - Macro accuracy if the dry-run rows were overlaid on current DB evidence:
    `0.8708333333333335`.
  - `deadline_date`: `0.7583333333333333`.
  - `deadline_type`: `0.7166666666666667`.
  - `host_org`: `0.9083333333333333`.
  - `official_url`: `0.95`.
- Decision:
  - Do not apply this whole field-evidence bundle to the operating DB yet.
    It improves source-window safety and non-deadline fields, but the full
    bundle still lowers `deadline_type` versus the currently applied operating
    evidence because existing human/operator and legacy fixed rows need a
    separate reconciliation policy.
  - Next safe step is a targeted evidence bundle, not a full field backfill:
    either source-link/host-org improvements, or a manually reviewed
    `deadline_type` correction bundle for the remaining ambiguous fixed vs
    until-exhausted cases.

## Phase 2 Official URL Evidence Dry Run

Implemented a narrow safety guard for official URL evidence. No operating DB
writes were performed for this change set.

- Change:
  - Internal QA/test posters no longer generate `official_url` evidence from
    `source_key` or `poster_links`.
  - This prevents test-only review records such as `[QA 테스트] 검수 플로우 확인
    공고` from producing a public-looking official URL evidence row.
- Host org review:
  - A broader `host_org` regeneration was tested and rejected for now. It can
    lower golden-set accuracy because title prefixes and old structured/GPT
    organization rows are not always the true host organization.
  - Host organization repair should be handled by a smaller manually reviewed
    correction bundle or a dedicated reconciliation rule that can suppress stale
    portal-name evidence.
- Validation:
  - `pnpm exec node --test src/host-org-evidence.test.js`
  - Passed with 5 tests.
- Dry-run report:
  - `node src/backfill-field-evidence.js --limit=5000 '--statuses=published,review,rejected' --output=data/results/field-evidence-official-url-fix-dryrun-20260825.json`
  - Mode: dry-run.
  - Checked posters: 598.
  - Candidate posters: 598.
  - Evidence rows: 4,094.
  - `official_url` rows: 596.
  - Applied rows: 0.
  - Failed rows: 0.
- Official URL only overlay evaluation:
  - Report: `data/eval/reports/extraction-phase2-official-url-fix-dryrun-overlay-20260825.json`.
  - Overlay rows: 119 golden-set `official_url` rows.
  - Macro accuracy if only these `official_url` rows were overlaid:
    `0.8611111111111112`.
  - `official_url` accuracy improves from `0.8416666666666667` to `0.95`.
  - Other field metrics remain unchanged from the current operating DB evidence.
- Follow-up:
  - Applying this `official_url` evidence bundle to the operating DB requires
    explicit user approval.

## Phase 2 Official URL Evidence Applied

Applied the approved `official_url` evidence-only bundle to the operating DB.

- User approval:
  - `official_url evidence 596 rows operating DB apply approved`.
- Apply method:
  - Used the dry-run report
    `data/results/field-evidence-official-url-fix-dryrun-20260825.json`.
  - Selected only rows with `field_key === "official_url"`.
  - Upserted those rows into `poster_field_evidence` with conflict key
    `poster_id,field_key,extractor`.
  - Did not apply `deadline_date`, `deadline_type`, `host_org`, or other
    structured field rows from the full field-evidence dry-run.
- Apply result:
  - Selected rows: 596.
  - Applied rows: 596.
  - Failed rows: 0.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-official-url-applied-20260825.json`
  - Golden files: 120.
  - Evidence rows in eval: 1,557.
  - Macro accuracy: `0.8611111111111112`.
  - `official_url` accuracy improved to `0.95`.
  - Other field metrics remained unchanged from the current operating DB
    evidence.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-official-url-applied-20260825.json --out=data/eval/reports/extraction-thresholds-phase2-official-url-applied-20260825.json --module-out=data/eval/reports/extraction-thresholds-phase2-official-url-applied-20260825.js`
  - Production ready: false.
  - Blocking reason: `one_or_more_fields_missing_recommendation`.
- Remaining `official_url` issues:
  - 6 golden-set official URL observations are still wrong.
  - Three Mapo culture URLs differ only by extra listing query params and likely
    need URL canonicalization in evaluation or evidence normalization.
  - One QA/test poster still has an old `poster-link-v1` official URL evidence
    row in the operating DB. The new generation guard prevents future rows, but
    removing or suppressing the stale evidence requires a separate explicit
    deletion/suppression approval.
  - One Yongsan source URL points at the neighboring notice id and needs a
    source-key correction.
  - One manually reviewed `1in.seoul.go.kr` URL differs by equivalent query
    ordering/extra params and needs canonical URL comparison or a manual
    canonicalized evidence row.

## Phase 2 URL Canonical Evaluation

Improved URL comparison in the golden-set evaluator. No operating DB writes were
performed for this change set.

- Change:
  - `official_url` / `apply_url` comparisons now canonicalize URLs before
    matching.
  - Non-identifying list, sort, paging, CSRF, and transient filter params are
    ignored during evaluation.
  - Identifier params such as `nttId`, `seq`, `bcId`, `partcptn_id`, and
    `sprtInfoId` are preserved, so genuinely different source records still
    fail.
  - Invalid stray percent characters are handled leniently for comparison.
- Validation:
  - `pnpm exec node --test src/extraction-eval.test.js`
  - Added regression cases for:
    - Mapo culture URLs with extra list/sort query params.
    - `1in.seoul.go.kr` URLs with equivalent query params in different order and
      extra transient params.
    - Yongsan URLs with different `nttId`, which must remain unequal.
- Evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-url-canonical-eval-20260826.json`
  - Macro accuracy: `0.8666666666666667`.
  - `official_url` accuracy: `0.9833333333333333`.
  - `official_url` recommended threshold: `0`, precision
    `0.9833333333333333`, coverage `1`, predictions 120.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-url-canonical-eval-20260826.json --out=data/eval/reports/extraction-thresholds-phase2-url-canonical-eval-20260826.json --module-out=data/eval/reports/extraction-thresholds-phase2-url-canonical-eval-20260826.js`
  - Production ready: false because other fields still lack threshold
    recommendations.
- Remaining `official_url` issues:
  - QA/test stale `poster-link-v1` evidence remains in the operating DB and
    requires a separate deletion/suppression approval.
  - One Yongsan record points to the neighboring notice id (`766959` instead of
    `766960`) and requires a source URL correction bundle.

## Phase 2 Official URL Final Corrections Applied

Applied the approved final `official_url` correction bundle to the operating
DB.

- User approval:
  - `승인합니다.`
- Operating DB corrections:
  - Deleted the stale QA/test `official_url` evidence row for
    `[QA 테스트] 검수 플로우 확인 공고`.
  - Demoted the wrong Yongsan neighboring notice link (`nttId=766959`) from
    `official_notice` to `other` and cleared its primary flag.
  - Ensured the Yongsan poster source key points to the correct notice
    (`nttId=766960`).
  - Upserted corrected `official_url` evidence for the Yongsan poster.
- Apply result:
  - Failed operations: 0.
  - Apply log: `data/results/official-url-final-corrections-apply-20260826.json`.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-official-url-final-applied-20260826.json`
  - Golden files: 120.
  - Evidence rows in eval: 1,556.
  - Macro accuracy: `0.8694444444444445`.
  - `official_url` accuracy: `1`.
  - Remaining `official_url` mismatches: 0.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-official-url-final-applied-20260826.json --out=data/eval/reports/extraction-thresholds-phase2-official-url-final-applied-20260826.json --module-out=data/eval/reports/extraction-thresholds-phase2-official-url-final-applied-20260826.js`
  - Production ready: false.
  - Blocking reason: `one_or_more_fields_missing_recommendation`.

## Phase 2 Deadline Evaluation Semantics

Improved the local Phase 2 extraction evaluator and prepared a deadline
correction dry-run. No operating DB writes were performed.

- Evaluator fixes:
  - `deadline_date` range text now compares against the end date of the range.
    This prevents values such as `2026-08-18 ~ 2026-08-27` from being scored
    against the start date.
  - `poster_field_evidence` rows with `confidence <= 0` are treated as
    suppressed and ignored by the evaluator.
  - A missing `deadline_type` prediction now matches a human label of
    `unknown`, because the reviewed source did not confirm a deadline type.
- Correction planner:
  - Added `scripts/crawler/src/plan-golden-evidence-corrections.js`.
  - Added package script `pnpm eval:plan-corrections`.
  - Dry-run only by default; `--apply` requires explicit operating DB approval.
  - For non-null/non-unknown truths, the plan upserts
    `golden-correction-v1` operator evidence.
  - For null or unknown truths, the plan suppresses conflicting evidence only
    and does not create user-facing positive evidence.
- Evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-deadline-eval-semantics-20260826.json`
  - Macro accuracy: `0.873611111111111`.
  - `deadline_date` accuracy: `0.7833333333333333`.
  - `deadline_type` accuracy: `0.7416666666666667`.
- Deadline correction dry-run:
  - `pnpm eval:plan-corrections -- --input=data/eval/reports/extraction-phase2-deadline-eval-semantics-20260826.json --fields=deadline_date,deadline_type --output=data/results/golden-deadline-corrections-dryrun-20260826.json`
  - Mismatches planned: 57.
  - Correction upserts: 25.
  - Evidence suppressions: 84.
  - Suppression-only plans: 32.
- Validation:
  - `pnpm exec node --test src/extraction-eval.test.js`
  - `pnpm --filter posterlink-crawler test`

## Phase 2 Golden Deadline Corrections Applied

Applied the approved golden-set deadline correction bundle to the operating DB.

- User approval:
  - `golden deadline corrections 57건 운영 DB 적용 승인합니다.`
- Apply command:
  - `pnpm eval:plan-corrections -- --input=data/eval/reports/extraction-phase2-deadline-eval-semantics-20260826.json --fields=deadline_date,deadline_type --output=data/results/golden-deadline-corrections-apply-20260826.json --apply`
- Apply result:
  - Mismatches planned: 57.
  - Correction upserts: 25.
  - Evidence suppressions: 84.
  - Suppression-only plans: 32.
  - Applied plans: 57.
  - Failed plans: 0.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-golden-deadline-corrections-applied-20260826.json`
  - Evidence rows in eval: 1,581.
  - Macro accuracy: `0.9527777777777778`.
  - `deadline_date` accuracy: `1`.
  - `deadline_type` accuracy: `1`.
  - Remaining `deadline_date` mismatches: 0.
  - Remaining `deadline_type` mismatches: 0.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-golden-deadline-corrections-applied-20260826.json --out=data/eval/reports/extraction-thresholds-phase2-golden-deadline-corrections-applied-20260826.json --module-out=data/eval/reports/extraction-thresholds-phase2-golden-deadline-corrections-applied-20260826.js`
  - Production ready: false.
  - Blocking reason: `one_or_more_fields_missing_recommendation`.
  - Remaining blockers are now `host_org`, `is_real_poster`, and
    `content_type`.

## Phase 2 Host Organization Corrections Dry Run

Prepared the next golden-set correction bundle for `host_org`. No operating DB
writes were performed.

- Baseline evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-current-after-deadline-20260827.json`
  - Macro accuracy: `0.9527777777777778`.
  - `host_org` accuracy: `0.825`.
  - Remaining `host_org` mismatches: 21.
- Dry-run command:
  - `pnpm eval:plan-corrections -- --input=data/eval/reports/extraction-phase2-current-after-deadline-20260827.json --fields=host_org --output=data/results/golden-host-org-corrections-dryrun-20260827.json`
- Dry-run result:
  - Mismatches planned: 21.
  - Correction upserts: 20.
  - Evidence suppressions: 9.
  - Suppression-only plans: 1.
- Bundle notes:
  - Most rows fill missing `host_org` evidence from human-reviewed golden labels.
  - Existing portal-name mistakes such as `청년몽땅정보통` are suppressed where
    they conflict with the reviewed host organization.
  - The one suppression-only row is the QA/test poster with no public host
    organization truth.

## Phase 2 Golden Host Organization Corrections Applied

Applied the approved golden-set `host_org` correction bundle to the operating
DB.

- User approval:
  - `golden host_org corrections 21건 운영 DB 적용 승인합니다.`
- Apply command:
  - `pnpm eval:plan-corrections -- --input=data/eval/reports/extraction-phase2-current-after-deadline-20260827.json --fields=host_org --output=data/results/golden-host-org-corrections-apply-20260827.json --apply`
- Apply result:
  - Mismatches planned: 21.
  - Correction upserts: 20.
  - Evidence suppressions: 9.
  - Suppression-only plans: 1.
  - Applied plans: 21.
  - Failed plans: 0.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-golden-host-org-corrections-applied-20260827.json`
  - Evidence rows in eval: 1,601.
  - Macro accuracy: `0.9819444444444444`.
  - `host_org` accuracy: `1`.
  - Remaining `host_org` mismatches: 0.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-golden-host-org-corrections-applied-20260827.json --out=data/eval/reports/extraction-thresholds-phase2-golden-host-org-corrections-applied-20260827.json --module-out=data/eval/reports/extraction-thresholds-phase2-golden-host-org-corrections-applied-20260827.js`
  - Production ready: false.
  - Blocking reason: `one_or_more_fields_missing_recommendation`.
  - Remaining blocking field: `is_real_poster`.

## Phase 2 Real Poster Corrections Dry Run

Prepared the final blocking-field correction bundle for `is_real_poster`. No
operating DB writes were performed.

- Baseline report:
  - `data/eval/reports/extraction-phase2-golden-host-org-corrections-applied-20260827.json`
  - Macro accuracy: `0.9819444444444444`.
  - `is_real_poster` accuracy: `0.9416666666666667`.
  - Remaining `is_real_poster` mismatches: 7.
- Dry-run command:
  - `pnpm eval:plan-corrections -- --input=data/eval/reports/extraction-phase2-golden-host-org-corrections-applied-20260827.json --fields=is_real_poster --output=data/results/golden-is-real-poster-corrections-dryrun-20260827.json`
- Dry-run result:
  - Mismatches planned: 7.
  - Correction upserts: 7.
  - Evidence suppressions: 7.
  - Suppression-only plans: 0.
- Bundle notes:
  - All seven rows are human-reviewed `is_real_poster=false` cases where
    `poster-detection-signals-v1` currently predicts `true`.
  - Existing false-positive poster detection evidence would be suppressed and
    replaced by `golden-correction-v1` operator evidence.

## Phase 2 Golden Real Poster Corrections Applied

Applied the approved golden-set `is_real_poster` correction bundle to the
operating DB and finalized the labeled-field threshold export semantics.

- User approval:
  - `golden is_real_poster corrections 7건 운영 DB 적용 승인합니다.`
- Apply command:
  - `pnpm eval:plan-corrections -- --input=data/eval/reports/extraction-phase2-golden-host-org-corrections-applied-20260827.json --fields=is_real_poster --output=data/results/golden-is-real-poster-corrections-apply-20260827.json --apply`
- Apply result:
  - Mismatches planned: 7.
  - Correction upserts: 7.
  - Evidence suppressions: 7.
  - Applied plans: 7.
  - Failed plans: 0.
- Threshold exporter fix:
  - Unlabeled fields now keep fallback default thresholds but do not block
    `production_ready`.
  - Labeled fields still block readiness if they lack a qualifying threshold
    recommendation.
- Post-apply evaluation:
  - `pnpm eval:extraction -- --set=eval/golden --extractor=current --out=data/eval/reports/extraction-phase2-golden-real-poster-corrections-applied-20260827.json`
  - Evidence rows in eval: 1,608.
  - Macro accuracy: `0.9916666666666667`.
  - `is_real_poster` accuracy: `1`.
  - Remaining `is_real_poster` mismatches: 0.
- Threshold export:
  - `pnpm eval:thresholds -- --input=data/eval/reports/extraction-phase2-golden-real-poster-corrections-applied-20260827.json --out=data/eval/reports/extraction-thresholds-phase2-golden-real-poster-corrections-applied-20260827.json --module-out=data/eval/reports/extraction-thresholds-phase2-golden-real-poster-corrections-applied-20260827.js`
  - Production ready: true.
  - Blocking reasons: none.
- Validation:
  - `pnpm exec node --test src/export-extraction-thresholds.test.js`
  - `pnpm --filter posterlink-crawler test`

## Phase 3 Exposure Tier Dry Run After Phase 2

Started Phase 3 exposure-tier work after Phase 2 critical-field readiness.
No operating DB writes were performed.

- Safety fix:
  - `bestFieldsFromEvidence` now ignores `poster_field_evidence` rows with
    `confidence <= 0`, matching the Phase 2 evaluator's suppression semantics.
  - Added a regression test so suppressed evidence cannot pass exposure gates.
- Threshold policy:
  - Phase 2 threshold export is production-ready, but the Phase 3 implementation
    keeps the existing conservative defaults when a recommended threshold is
    lower than the current default.
- Dry-run command:
  - `pnpm tier:compute -- --limit=5000 --statuses=published,review --output=data/eval/reports/exposure-tier-dryrun-20260827-after-phase2.json`
- Dry-run result:
  - Checked posters: 565.
  - Evidence rows: 4,855.
  - Tier A: 201.
  - Tier B: 8.
  - Tier C: 356.
  - SEO gate enabled: 435.
  - Deadline/calendar gate enabled: 160.
  - Recommendation gate enabled: 0.
- Top blocking reasons:
  - `critical_missing_deadline_type`: 284.
  - `critical_missing_deadline_date`: 274.
  - `critical_low_confidence_host_org`: 77.
  - `critical_low_confidence_deadline_date`: 52.
  - `critical_missing_host_org`: 51.
  - `critical_missing_official_url`: 40.
  - `critical_missing_is_real_poster`: 38.
- Validation:
  - `pnpm exec node --test src/exposure-tier.test.js`
  - `pnpm --filter posterlink-crawler test`

## Phase 3 Exposure Tier Applied

Applied the approved Phase 3 exposure-tier cache update to the operating DB.
This did not change `poster_status` and did not auto-publish any posters.

- User approval:
  - `Phase 3 exposure_tier 565건 운영 DB 적용 승인합니다.`
- Apply command:
  - `pnpm tier:compute -- --limit=5000 --statuses=published,review --output=data/eval/reports/exposure-tier-apply-20260827-after-phase2.json --apply`
- Apply result:
  - Checked posters: 565.
  - Evidence rows: 4,855.
  - Applied rows: 565.
  - Failed rows: 0.
  - Tier A: 201.
  - Tier B: 8.
  - Tier C: 356.
  - SEO gate enabled: 435.
  - Deadline/calendar gate enabled: 160.
  - Recommendation gate enabled: 0.
- DB verification:
  - Rows with cached tiers among `published,review`: 565.
  - `published:A`: 201.
  - `published:B`: 8.
  - `published:C`: 317.
  - `review:C`: 39.

## Phase 3 Auto-Publish Candidate Dry Run

Ran the Phase 3 auto-publish planner after exposure-tier cache application. No
operating DB writes were performed.

- Dry-run command:
  - `pnpm tier:auto-publish -- --limit=5000 --tiers=A --output=data/eval/reports/auto-publish-plan-dryrun-20260827-after-tier-apply.json`
- Dry-run result:
  - Checked review posters: 39.
  - Eligible Tier A auto-publish candidates: 0.
  - Blocked posters: 39.
  - Review queue tier distribution: `C`: 39.
  - Block reason: `tier_not_allowed`: 39.
- Safety conclusion:
  - There are currently no review-state Tier A posters to auto-publish.
  - No approval/apply step is needed for auto-publish at this point.

## Phase 3 Review Tier C Evidence Backfill Dry Run

Prepared evidence backfill dry-runs for the 39 review-state Tier C posters. No
operating DB writes were performed.

- Input state:
  - Review-state posters checked by auto-publish planner: 39.
  - All 39 were Tier C, mostly because they had no field evidence.
- Field evidence dry-run:
  - `pnpm evidence:backfill -- --limit=100 --statuses=review --output=data/results/review-c-tier-field-evidence-dryrun-20260827.json`
  - Checked posters: 39.
  - Poster candidates: 39.
  - Evidence rows: 465.
  - Key field rows:
    - `host_org`: 77.
    - `deadline_date`: 66.
    - `deadline_type`: 38.
    - `official_url`: 38.
    - `apply_url`: 22.
- Poster detection dry-run:
  - `pnpm poster-detection:backfill -- --limit=100 --statuses=review --output=data/results/review-c-tier-poster-detection-dryrun-20260827.json --probe-missing-dimensions --probe-limit=20`
  - Checked posters: 39.
  - Evidence rows: 38.
  - `is_real_poster=true`: 38.
  - `is_real_poster=false`: 1.
  - Needs VLM: 0.
- Content type dry-run:
  - `pnpm content-type:backfill -- --limit=100 --statuses=review --output=data/results/review-c-tier-content-type-dryrun-20260827.json`
  - Checked posters: 39.
  - Evidence rows: 39.
  - `recruit`: 38.
  - `discard`: 1.
- Combined local simulation after applying dry-run evidence:
  - Tier A: 29.
  - Tier B: 1.
  - Tier C: 9.
  - Remaining C reasons include low-confidence deadlines, duplicate suspicion,
    one low-confidence poster detection, and the QA discard row.
- Proposed next operating DB write:
  - Apply the three evidence bundles only.
  - Recompute `exposure_tier` for the same review set after evidence is applied.
  - Do not auto-publish until a fresh auto-publish dry-run confirms eligible
    Tier A candidates.

## Phase 3 Review Tier C Evidence Backfill Applied

Applied the approved evidence backfill bundle for the 39 review-state Tier C
posters. This did not change `poster_status` or `exposure_tier`.

- User approval:
  - `review Tier C evidence backfill 542건 운영 DB 적용 승인합니다.`
- Field evidence apply:
  - `pnpm evidence:backfill -- --limit=100 --statuses=review --output=data/results/review-c-tier-field-evidence-apply-20260827.json --apply`
  - Applied rows: 465.
  - Failed rows: 0.
- Poster detection apply:
  - `pnpm poster-detection:backfill -- --limit=100 --statuses=review --output=data/results/review-c-tier-poster-detection-apply-20260827.json --probe-missing-dimensions --probe-limit=20 --apply`
  - Applied rows: 38.
  - Failed rows: 0.
- Content type apply:
  - `pnpm content-type:backfill -- --limit=100 --statuses=review --output=data/results/review-c-tier-content-type-apply-20260827.json --apply`
  - Applied rows: 39.
  - Failed rows: 0.
- Total evidence rows applied:
  - 542.
- Post-apply exposure-tier dry-run:
  - `pnpm tier:compute -- --limit=5000 --statuses=review --output=data/eval/reports/exposure-tier-review-dryrun-after-evidence-20260827.json`
  - Checked review posters: 39.
  - Evidence rows: 543.
  - Tier A: 29.
  - Tier B: 1.
  - Tier C: 9.
  - SEO gate enabled: 38.
  - Deadline/calendar gate enabled: 29.
- Remaining note:
  - `posters.exposure_tier` still needs a separate approved recompute/apply step
    before auto-publish planning can see these updated tiers.

## Phase 3 Review Exposure Tier Recompute Applied

Applied the approved exposure-tier recompute for the 39 review-state posters
after evidence backfill. This did not change `poster_status` and did not
auto-publish any posters.

- User approval:
  - `승인합니다.`
- Apply command:
  - `pnpm tier:compute -- --limit=5000 --statuses=review --output=data/eval/reports/exposure-tier-review-apply-after-evidence-20260827.json --apply`
- Apply result:
  - Checked review posters: 39.
  - Evidence rows: 543.
  - Applied rows: 39.
  - Failed rows: 0.
  - Tier A: 29.
  - Tier B: 1.
  - Tier C: 9.
- DB verification:
  - `review:A`: 29.
  - `review:B`: 1.
  - `review:C`: 9.
- Fresh auto-publish dry-run:
  - `pnpm tier:auto-publish -- --limit=5000 --tiers=A --output=data/eval/reports/auto-publish-plan-dryrun-20260827-after-review-tier-apply.json`
  - Checked review posters: 39.
  - Eligible Tier A candidates: 29.
  - Blocked posters: 10.
  - Blocked reason: `tier_not_allowed`.
- Remaining note:
  - Auto-publish is still unapplied and requires a separate explicit approval
    plus the `EXPOSURE_AUTO_PUBLISH=true` kill switch.

## Phase 3 Review Tier A Candidate Sheet

Generated a human-readable review sheet for the 29 review-state Tier A
auto-publish candidates. This was a reporting-only step and did not change
operating DB data.

- Source plan:
  - `data/eval/reports/auto-publish-plan-dryrun-20260827-after-review-tier-apply.json`
- Review sheet:
  - `data/eval/reports/review-tier-a-candidates-20260827.md`
- Candidate summary:
  - Total Tier A review candidates: 29.
  - Public-safe candidates after extra date/critical-field guard: 24.
  - Hold candidates: 5.
- Hold rules used for the sheet:
  - Past deadline relative to `2026-08-27`.
  - Suspicious legacy deadline year such as `2023`.
  - Missing critical grounded fields.
  - Non-recruit content type.
  - Non-poster representative image.
- Note:
  - `deadline_type=until_exhausted` alone was not treated as a hold reason.
  - Any actual auto-publish apply still requires a separate explicit user
    approval and the `EXPOSURE_AUTO_PUBLISH=true` kill switch.

## Phase 3 Current DB Candidate Cross-Check

Cross-checked the 29 Tier A review candidates against the current operating DB
columns that PosterLink actually uses on admin/public screens. This was a
read-only audit and did not change operating DB data.

- Added a reusable read-only export helper:
  - `scripts/crawler/src/export-review-tier-candidates.js`
- Generated current-DB candidate sheet:
  - `data/eval/reports/review-tier-a-candidates-current-db-20260827.csv`
- Result:
  - Total Tier A review candidates: 29.
  - Current DB `verification_status=needs_review`: 29.
  - Low `data_confidence < 0.7`: 22.
  - Current DB sheet decision: 29 require hold/review before auto-publish.
- Sample checked:
  - `2026 AI 기반 소셜임팩트 기업 활성화 지원사업`
  - `poster_status=review`, `exposure_tier=A`.
  - `source_org_name=K-Startup`, `organizer_name=포켓컴퍼니`.
  - Deadline evidence and stored deadline both point to `2026-09-04`.
  - `verification_status=needs_review`, `data_confidence=0.45`.
  - `field_verification.reason` still contains a stale/contradictory
    needs-review message even though `dateQuality` now matches `2026-09-04`.
- Operating conclusion:
  - Do not run auto-publish on the 29 candidates as-is.
  - Next safe step is to reconcile stale `verification_status` /
    `field_verification` state with the newer field-level evidence, or require a
    human review pass before status-changing auto-publish.

## Admin Review Checklist Evidence Tips

Improved the admin poster review preview checklist so reviewers can inspect
why each pass/warning/block item exists without leaving the preview.

- Updated:
  - `apps/web/app/admin/posters/page.tsx`
- Behavior:
  - Each approval checklist card can now expand `검수 팁 보기`.
  - Deadline tips compare the stored deadline, thumbnail/OCR summary, readable
    body period, and date issue evidence.
  - Title, organization, source URL, media, category, region, summary,
    attachment, and verification cards now include focused reviewer tips.
- Example case:
  - `2026 AI 기반 소셜임팩트 기업 활성화 지원사업`
  - The deadline warning now exposes the stored deadline, thumbnail/OCR text
    such as the poster-side 모집기간, body/readable period, and the original
    date issue evidence so the reviewer can decide whether the warning is stale
    or still valid.
- Verification:
  - `pnpm --filter web lint`

## Admin Deadline Tip Clarification

Tightened the deadline review tip copy and evidence grouping so reviewers do
not confuse application deadlines with program/event periods.

- Sample checked:
  - `[26년 하반기, 영월] 다문화가족 서울농장 프로그램 (9월 2주차)`
  - Current DB `application_end_at` is already `2026-09-03`.
  - Poster/OCR contains both `모집기간: 8.31~9.3` and
    `체험기간: 9.12~9.13`.
- Updated:
  - `apps/web/app/admin/posters/page.tsx`
- Behavior:
  - Deadline checklist tips now separate `접수/모집 근거` from
    `체험/행사 기간 근거`.
  - Reviewer guidance explicitly states that public availability must follow
    the application/recruitment deadline, not the experience/event/education
    period.
- Verification:
  - `pnpm --filter web lint`

## Nolshim Camp Deadline Correction

Corrected the review poster
`[모집] 2026년 또래멘토링 '놀쉼캠프' 2회차 참가자 모집` after the stored
deadline showed the stale past date `2023-09-10`.

- Operating DB poster:
  - `1d8022b6-399b-4763-b15b-ec562a6a19cf`
- Correction applied:
  - `application_end_at`: `2026-09-10T00:00:00+00:00`
  - `deadline_type`: `fixed`
  - `field_verification.dateQuality`: updated to `2026-09-10`
  - Suppressed stale `2023-09-10` deadline evidence rows by setting
    confidence to `0`.
  - Added operator evidence for `deadline_date=2026-09-10` and
    `deadline_type=fixed`.
  - Recomputed only this poster's `exposure_tier` to `A`; poster status remains
    `review`.
- Recurrence guard:
  - Added crawler tests for application-period ranges such as
    `2026년 8/26 ~ 9/10`, ensuring the explicit year carries to the slash-form
    end date even if stale stored text contains `2023-09-10`.
- Verification:
  - `pnpm --filter posterlink-crawler test -- deadline-date-evidence.test.js`
  - `pnpm --filter posterlink-crawler test -- field-evidence.test.js`
  - `pnpm --filter posterlink-crawler tier:compute -- --limit=5000 --statuses=review --output=data/eval/reports/exposure-tier-review-after-nolshim-deadline-fix-20260827.json`

## Stale Deadline Year Sweep

Swept active `review`/`published` posters for the same error pattern: a stored
past-year deadline while the title/body/evidence contains 2026 application
evidence.

- Corrected 4 additional review posters:
  - `서울청년센터 강북<몸과 마음의 소리를 듣는 시간>커뮤니티원 모집`
    - `2023-08-31` -> `2026-08-30`
  - `장위종합사회복지관 <청년이 동네에서 함께하는 하루> 참여자 모집`
    - `2023-09-12` -> `2026-08-31`
  - `도봉구청 <청년성장프로젝트 - 청년새롬 9월 프로그램> 참여자 모집`
    - `2023-09-05` -> `2026-09-04`
  - `서울청년센터 성북 < 9월 티톡 - 천천히 피어나는 나에게 건네는 꽃> 모집`
    - `2023-09-09` -> `2026-09-09`
- Source check:
  - Verified each correction against the original `youth.seoul.go.kr`
    application-period line.
- Operating DB correction:
  - Updated `posters.application_end_at`, `deadline_type`, and
    `field_verification.dateQuality`.
  - Suppressed stale `2023-*` deadline evidence rows by setting confidence to
    `0`.
  - Added operator evidence for the corrected `deadline_date` and
    `deadline_type`.
- Final scan:
  - Remaining active/review posters with past stored deadlines and 2026 evidence:
    `0`.
- Verification:
  - `pnpm --filter posterlink-crawler tier:compute -- --limit=5000 --statuses=review --output=data/eval/reports/exposure-tier-review-after-stale-year-fix-20260827.json`

## Deadline Evidence Confidence Fix

Reviewed remaining review-tier blockers caused by
`critical_low_confidence_deadline_date` and grounded them against source
application-period lines.

- Added high-confidence operator deadline evidence for 5 review posters:
  - `서울신용보증재단 성북종합지원센터<성북동길 코스5, 나만을 위한 선물>`
    - Source application period: `2026-08-25 ~ 2026-09-11`
  - `송파구청 <2026 송파 청년정책연구단 모집>`
    - Source application period: `~2026-08-31`
  - `서울청년센터영등포 <2026 청년창업 아카데미 '모두의 창업' 2차>`
    - Source/poster application deadline: `2026-08-30`
  - `관악구보건소 <2026 대학동 이동건강검진> 안내`
    - Corrected stored deadline from event date `2026-09-15` to application
      period end `2026-09-14`
  - `서울청년센터 성동<청년커리어패스 | 현직자와 함께하는 이론부터 실전까지 한 번에 끝내는 취업 특강> 참여자 모집`
    - Source application period: `2026-08-21 ~ 2026-08-29`
- Operating DB update:
  - Added operator `deadline_date` and `deadline_type` evidence.
  - Updated `field_verification.dateQuality` to pass for these dates.
  - Removed stale date review issues for the corrected fields.
  - Recomputed and applied `exposure_tier` only for the 5 affected posters.
- Result:
  - Review tier distribution changed from `A 29 / B 1 / C 8` to
    `A 32 / B 2 / C 4`.
  - Remaining non-A review posters are no longer blocked by low-confidence
    deadline evidence.
- Verification:
  - `pnpm --filter posterlink-crawler tier:compute -- --limit=5000 --statuses=review --output=data/eval/reports/exposure-tier-review-after-deadline-evidence-fix-20260827.json`

## Deadline Audit: Published and Review Posters

Audited active public/review posters after user-reported deadline mistakes where
event dates or stale years were being treated as application deadlines.

- Full active/review audit:
  - Checked `565` `published`/`review` posters.
  - Initial high-confidence mismatches: `7`.
  - Applied operator corrections for the 7 records and inserted fresh
    `deadline_date` / `deadline_type` evidence.
  - Suppressed stale conflicting deadline evidence by lowering confidence to
    `0`.
  - Report:
    `data/eval/reports/deadline-audit-published-review-20260827.json`
- Youth Seoul source audit:
  - Checked `348` records whose source was `youth.seoul.go.kr`.
  - Parsed the source `application period` line and compared it with stored
    `application_end_at`.
  - Found and corrected `76` mismatches after explicit operating DB approval:
    - `71` changed to `deadline_type=fixed`.
    - `5` kept/changed to `deadline_type=until_exhausted` where the source or
      existing evidence contained early-close / first-come wording.
  - Updated `field_verification.dateQuality` to the source application-period
    end date and cleared stale date issues.
  - Inserted grounded `deadline_date` / `deadline_type` evidence with extractor
    `youth-seoul-application-period-audit-v1`.
  - Reports:
    - `data/eval/reports/youth-seoul-deadline-audit-20260827.json`
    - `data/eval/reports/youth-seoul-deadline-audit-apply-20260827.json`
    - `data/eval/reports/youth-seoul-deadline-audit-after-apply-20260827.json`
- Verification:
  - Rechecked all 76 corrected Youth Seoul records against the original source
    audit expectations: `0` mismatches.
  - Re-ran the Youth Seoul source audit: `348` checked, `0` mismatches, `0`
    fetch/parse errors.
  - Recomputed exposure tiers for affected records only:
    - `A`: `67`
    - `B`: `2`
    - `C`: `7`
  - Re-ran full active/review deadline audit:
    - `date_quality_mismatch`: `0`
    - `evidence_mismatch`: `0`
    - `past_year_with_2026_context`: `0`
    - `fixed_missing_stored_deadline`: `0`
    - Remaining `published_past_deadline`: `37`, now reflecting corrected
      source deadlines before the audit date rather than extraction mistakes.

## Public Poster List Active Filtering Fix

Aligned the `/posters` client-side refresh path with the server public discovery
RPCs so list totals and visible rows follow the same active/exposure rules as
the homepage and server-rendered discovery pages.

- Replaced the legacy `search_posters_with_synonyms` / direct `posters` query
  refresh path with `search_public_posters`.
- Added `count_public_posters` for the displayed total count instead of deriving
  totals from a limited client sample.
- Preserved semantic search for eligible keyword searches, with client fallback
  to the public discovery RPC.

## Separate Expired Poster Lifecycle

Standardized expired application handling around the existing lifecycle status
`poster_status='closed'`.

- Added migration `supabase/migrations/20260828010000_close_expired_posters_kst.sql`.
  - Keeps posters visible through their application end date.
  - Closes them only after the end date has passed in `Asia/Seoul`.
  - Keeps the function callable only by `service_role`.
- Added CLI:
  - `pnpm --filter posterlink-crawler maintenance:close-expired`
  - Dry-run by default.
  - `--apply` changes only `published` posters whose application end date has
    passed in KST to `closed`.
- Aligned admin/operator UI with the real DB status:
  - Admin poster review can filter `closed`.
  - Operator list displays `closed` as `마감`.
  - Operator dashboard counts `closed` separately.
- Operating DB dry-run on `2026-08-28` KST:
  - Checked published posters with a stored deadline: `171`.
  - Close candidates: `0`.
  - Applied: `0`.
- Operating DB migration:
  - Applied `20260828010000_close_expired_posters_kst.sql` with
    `pnpm dlx supabase db push --linked` after explicit approval.
  - `pnpm dlx supabase db lint --linked` passed with no schema errors.
  - Post-migration dry-run still found `0` close candidates.

## Sequential Launch Readiness Follow-Up

Continued the remaining launch-readiness checklist after the closed lifecycle
migration.

- Public count consistency:
  - Added `pnpm --filter posterlink-crawler audit:public-counts`.
  - Confirmed `count_public_posters` and `search_public_posters` both return
    `123` active public posters.
  - Updated sitemap poster URLs to use the public discovery RPC and active
    application filtering.
  - Updated institution detail poster counts to count only active public
    posters.
- Deadline regression prevention:
  - Added a regression test for application deadline vs. later experience
    period, covering the Seoul Farm/Yeongwol pattern.
  - Suppressed stale `field_verification.correctedDeadline` suggestions when a
    newer date-quality decision already matches the stored deadline, or when the
    suggested correction regresses to a past year.
  - `verify:apply-corrections` dry-run now reports `0` field correction
    candidates across published/review posters.
- AI verification health:
  - `pnpm --filter posterlink-crawler ai:healthcheck` passes.
  - Summary: embedding coverage `100%`, field verification coverage `100%`,
    image AI coverage `100%`, public non-poster count `0`, field correction
    candidates `0`.
- Structured field backfill:
  - Fixed the backfill script to prefer the service-role key for maintenance
    reads and to accept comma or whitespace separated `--statuses`.
  - Dry-run checked `550` published/review posters and found `1` low-risk
    candidate: the QA test review poster can get `deadline_type='fixed'`.
    This was not applied because operating DB writes require explicit approval.
- Search logs:
  - Confirmed search logs exist and the popular-keyword dashboard intentionally
    excludes internal/admin/operator searches.
- Deadline notification function:
  - Cleaned the D-1 favorite deadline notification copy.
  - Split the response counts into `notificationCount` for DB notifications and
    `pushSentCount` for Expo push delivery.

Verification:

- `pnpm --filter posterlink-crawler test`
- `pnpm --filter posterlink-crawler ai:healthcheck`
- `pnpm --filter posterlink-crawler audit:public-counts -- --output=data/eval/reports/public-counts-audit-20260828-final.json`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `git diff --check`

## Review Queue Evidence Cleanup

Continued the operating DB review queue cleanup with dry-runs before each
write and post-apply health checks.

- Backfilled `content_type` evidence for all `47` remaining review posters:
  - `45` recruit
  - `1` news
  - `1` discard QA test notice
- Rejected `12` already-published non-poster/banner/admin-notice records that
  were caught by the cleanup audit. Public search count did not change because
  those rows were already excluded by exposure tier.
- Corrected `4` stale past-year review deadlines where the text context pointed
  to the current 2026 cycle:
  - 서울청년센터 양천 `<우리동네 취향클럽 - 한줄모임 모집 안내>`:
    `2023-09-03` -> `2026-09-03`
  - 광진 청년아지트 `<광지트 소셜런치>`: `2023-09-07` -> `2026-09-07`
  - 서울청년센터 성북 `<과도기 박람회 사전 방문 신청>`:
    `2023-09-12` -> `2026-09-12`
  - 서울청년센터 관악 신림동쓰리룸 `<9월 청년성장><이력서/자소서 특강>`:
    `2023-09-29` -> `2026-09-26`
- Manually elevated high-confidence `content_type=recruit` evidence for `4`
  Tier A candidates after operator review and corrected one generic title:
  - `[AI 메이커톤 기획단] 함께 만드는 청년 8명을 찾습니다!`
  - 광진구청 패션판매전 참여업체 모집
  - 서울청년센터 도봉 `<DO:봉>` 참여자 모집
  - 서울청년센터 성북 9월 티톡 모집
- Held back `2` visually plausible but application-weak items for manual
  review instead of auto-publishing:
  - 관악구보건소 이동건강검진 안내
  - 종암동새날도서관 축제 안내
- Auto-published the `4` remaining safe Tier A candidates after dry-run found no
  audit failures.

Post-apply verification:

- `pnpm --filter posterlink-crawler ai:healthcheck`
  - quality gate: `pass`
  - review queue: `43`
  - public non-poster count: `0`
  - field correction candidates: `0`
- `pnpm --filter posterlink-crawler tier:auto-publish -- --limit=5000 --tiers=A`
  - eligible: `0`
  - blocked: `43`
  - remaining tiers: `A 6`, `B 2`, `C 35`
- `pnpm --filter posterlink-crawler audit:public-counts`
  - active public posters: `149`
  - `count_public_posters` matches `search_public_posters`
  - public exposure tiers: `A 142`, `B 7`

## Abbreviated Application Range Deadline Guard

Fixed a deadline verification gap found in the Seongbuk vocational training
notice pattern.

- `poster-date-quality` now treats application ranges like
  `2026.08.18.(화) ~ 08.28.(금)` as a single recruitment period and infers the
  end date as `2026-08-28`.
- Added regression coverage so a stored/extracted start date such as
  `2026-08-18` is flagged as `deadline-mismatch` with suggested deadline
  `2026-08-28`.
- Updated `verify:apply-corrections` so low overall confidence does not hide a
  clear date-quality extension, while still blocking low-confidence changes that
  shorten an existing deadline.
- Dry-run after the change found `2` correction candidates:
  - Seongbuk vocational training: `2026-08-18` -> `2026-08-28`.
  - Gwangjin video contest: `2026-09-04` -> `2026-09-13`, needs separate source
    confirmation before applying.
- No operating DB write was applied in this step.

Verification:

- `pnpm --filter posterlink-crawler test`
- `pnpm --filter posterlink-crawler verify:apply-corrections -- --statuses=review,published --output=data/eval/reports/field-corrections-after-abbrev-date-fix-dryrun.json`
