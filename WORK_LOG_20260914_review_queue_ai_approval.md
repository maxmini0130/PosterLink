# 2026-09-14 review queue AI approval

## Scope

User asked Codex to directly read the current review queue and approve items if
the source text, dates, and categories were safe.

## Input State

- Branch: `feat/ai-verification-phase-1`
- Start checks:
  - `git fetch origin`
  - `git status --short --branch`
- Review snapshot: `data/results/current-review-queue-20260914.json`
- Input review rows: 2

## Applied Work

- Added `scripts/crawler/src/apply-review-queue-approval-20260914.js`.
- Dry-run report:
  - `data/results/review-queue-approval-20260914-dryrun.json`
  - planned: 2
  - skipped: 0
- Apply report:
  - `data/results/review-queue-approval-20260914-apply.json`
  - applied: 2
  - skipped: 0

## Decisions

- `동대문구 <2026 동대문구 북페스티벌-책력장> 개최 안내`
  - Source states event date `2026. 9. 12.(토) 12:00~17:00`.
  - As of 2026-09-14 KST the event has passed, so it was moved from
    `review` to `closed`, not published.
  - Categories: `CAT_EVENT_RECRUIT`, `CAT_CULTURE`.
- `서울청년센터 강서 <(어쩌다 청년생활) 워터 말랑이 뜨개 키링 만들기> 참여자 모집`
  - Source states event date `2026. 9. 19.(토) 13:15~14:15`.
  - Application period is `2026. 8. 31.(월) ~ 모집 시까지`; no fixed end date
    was invented.
  - Approved as `published` with `deadline_type = until_exhausted`.
  - Categories: `CAT_EVENT_RECRUIT`, `CAT_LIFE_INFO`.

## Link Cleanup

- The Gangseo workshop row had unrelated links from adjacent "어쩌다 청년생활"
  notices.
- Kept only:
  - application form: `https://forms.gle/FBHa57JL1G3PiQRZ9`
  - official notice: `sprtInfoId=73453`

## Verification

- `pnpm exec node --check scripts/crawler/src/apply-review-queue-approval-20260914.js`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260914.js --output=data/results/review-queue-approval-20260914-dryrun.json`
- `pnpm exec node scripts/crawler/src/apply-review-queue-approval-20260914.js --apply --confirm=APPLY_REVIEW_QUEUE_APPROVAL_20260914 --output=data/results/review-queue-approval-20260914-apply.json`
- Status counts after apply:
  - `published`: 536
  - `review`: 0
  - `closed`: 2026
  - `rejected`: 58
- `pnpm --filter posterlink-crawler audit:public-counts`
  - `count_public_posters`: 237
  - `search_public_posters_returned`: 237
  - `search_matches_count`: true
- `pnpm exec node scripts/crawler/src/audit-date-period-mapping.js --output=data/eval/reports/date-period-mapping-audit-20260914.json`
  - audited: 536
  - stale warning: 6
  - mismatch: 9
  - missing clear deadline: 0
  - actionable: 15
  - Remaining warnings are existing public-data quality backlog items.

## Remaining Work

- No current `poster_status = review` rows remain.
