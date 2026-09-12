# 2026-09-12 review queue follow-up

## Scope

User asked Codex to directly read the remaining review queue items and approve items
that were safe after checking source text, dates, and categories.

## Input State

- Branch: `feat/ai-verification-phase-1`
- Start checks:
  - `git fetch origin`
  - `git status --short --branch`
- Review snapshot: `data/results/current-review-queue-20260912b.json`
- Input review rows: 14

## Applied Work

- Added `scripts/crawler/src/apply-review-queue-approval-20260912b.js`.
- Dry-run report:
  - `data/results/review-queue-approval-20260912b-dryrun.json`
  - planned approvals: 14
  - skipped: 0
- Apply report:
  - `data/results/review-queue-approval-20260912b-apply.json`
  - approved: 14
  - skipped: 0

## Date And Category Decisions

- K-Startup startup education/support/business notices were approved with application
  periods separated from later event or program dates.
- Open public events without a separate application period were approved with the
  last event day as the user-facing deadline.
- `until_exhausted` was preserved for the Gangseo youth center workshop because the
  source states "from 2026-08-31 until recruitment closes" and does not provide a
  fixed end date.
- A stale 2023 year extraction on the forest-food pop-up was corrected to the 2026
  source context.
- Broad welfare/category fallbacks were replaced with narrower current categories:
  - `CAT_COURSE`
  - `CAT_BUSINESS`
  - `CAT_SUPPORT_PROGRAM`
  - `CAT_EVENT_RECRUIT`
  - `CAT_LIFE_INFO`
  - `CAT_CULTURE`
  - `CAT_RECRUITMENT`
  - `CAT_POLICY_INFO`

## Link Cleanup

Four rows had polluted or unrelated crawler links and were normalized during
approval:

- Dongjak one-person-household day trip: kept two valid Google Forms and the
  official 1in Seoul notice; removed malformed form URLs.
- Gangseo youth center workshop: kept only the matching application form and notice
  for `sprtInfoId=73435`.
- Seongdong youth-issue mini lab: kept only the matching official notice
  `sprtInfoId=73986`.
- Seoul Youth Day festival guide: kept only the matching guide notice
  `sprtInfoId=73984`.

## Verification

- `pnpm exec node --check scripts/crawler/src/apply-review-queue-approval-20260912b.js`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260912b.js --output=data/results/review-queue-approval-20260912b-dryrun.json`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260912b.js --apply --confirm=APPLY_REVIEW_QUEUE_APPROVAL_20260912B --output=data/results/review-queue-approval-20260912b-apply.json`
- Status counts after apply:
  - `published`: 575
  - `review`: 0
  - `closed`: 1985
  - `rejected`: 58
- `pnpm --filter posterlink-crawler audit:public-counts`
  - `count_public_posters`: 277
  - `search_public_posters_returned`: 277
  - `search_matches_count`: true
- `pnpm exec node scripts/crawler/src/audit-date-period-mapping.js --output=data/eval/reports/date-period-mapping-audit-20260912b.json`
  - audited: 575
  - stale warning: 6
  - mismatch: 10
  - missing clear deadline: 0
  - actionable: 16
  - Remaining warnings are pre-existing heuristic conflicts or manually verified
    application-deadline-vs-event-date cases, not new blockers from this queue.

## Remaining Work

- No current `poster_status = review` rows remain.
- Existing date-audit warnings can be reviewed separately as a quality backlog.
