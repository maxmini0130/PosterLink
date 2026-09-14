# 2026-09-14 review queue AI approval follow-up

## Scope

User asked Codex to directly read the current review queue and approve safe items
with special attention to dates and categories.

## Input State

- Branch: `feat/ai-verification-phase-1`
- Start checks:
  - `git fetch origin`
  - `git status --short --branch`
- Review snapshot: `data/results/current-review-queue-20260914b.json`
- Input review rows: 16

## Applied Work

- Added `scripts/crawler/src/apply-review-queue-approval-20260914b.js`.
- Dry-run report:
  - `data/results/review-queue-approval-20260914b-dryrun.json`
  - planned: 16
  - skipped: 0
- Apply report:
  - `data/results/review-queue-approval-20260914b-apply.json`
  - applied: 16
  - skipped: 0

## Date And Category Decisions

- Corrected stale or misleading date extraction:
  - `서울청년센터 마포 참가자 모집` had a stale `2023-10-14` deadline; it was
    replaced with 2026 course dates and `until_exhausted` because no fixed
    application deadline is stated.
- Preserved first-come/open-ended recruitment without inventing end dates:
  - Gangseo youth-center ramen-stand workshop
  - Gwanak one-person household program
  - Gangseo library author talk and library classes
- Separated application periods from event or course dates for fixed-deadline
  notices:
  - Seongdong youth-center meetup
  - Songpa matching program
  - Seoul Grand Park citizen safety inspection group
  - Local cafe and dessert brand popup
  - Seoul medical-friendly accommodation selection
- Replaced broad fallback categories such as `CAT_WELFARE` and `CAT_OTHER` with
  narrower operational categories:
  - `CAT_EVENT_RECRUIT`
  - `CAT_COURSE`
  - `CAT_CULTURE`
  - `CAT_LIFE_INFO`
  - `CAT_RECRUITMENT`
  - `CAT_BUSINESS`
  - `CAT_SUPPORT_PROGRAM`
  - `CAT_HEALTH`

## Link Cleanup

- Gangseo youth-center ramen-stand workshop: kept only the matching application
  form and official notice for `sprtInfoId=73456`.
- Seongdong youth-center meetup: removed incomplete `bit.ly/` link and kept the
  resolved Google Form plus official notice.
- Seoul medical-friendly accommodation selection: made the Google Form the primary
  application link while preserving required application attachments and official
  notice.

## Verification

- `pnpm exec node --check scripts/crawler/src/apply-review-queue-approval-20260914b.js`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260914b.js --output=data/results/review-queue-approval-20260914b-dryrun.json`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260914b.js --apply --confirm=APPLY_REVIEW_QUEUE_APPROVAL_20260914B --output=data/results/review-queue-approval-20260914b-apply.json`
- Status counts after apply:
  - `published`: 552
  - `review`: 0
  - `closed`: 2026
  - `rejected`: 58
- `pnpm --filter posterlink-crawler audit:public-counts`
  - `count_public_posters`: 249
  - `search_public_posters_returned`: 249
  - `search_matches_count`: true
- `pnpm exec node scripts/crawler/src/audit-date-period-mapping.js --output=data/eval/reports/date-period-mapping-audit-20260914b.json`
  - audited: 552
  - stale warning: 6
  - mismatch: 9
  - missing clear deadline: 0
  - actionable: 15
  - Remaining warnings are existing public-data quality backlog items, not new
    blockers from this review queue.

## Remaining Work

- No current `poster_status = review` rows remain.
