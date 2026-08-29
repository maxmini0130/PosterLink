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

## Code Changes

- `scripts/crawler/src/audit-notifications.js`
  - Writes `data/eval/reports/notification-push-audit.json`.
  - Adds poster metadata to target summaries.
  - Prints sendable notification targets in human output.
  - Separates top targets, sendable targets, and no-token targets in JSON.
- `scripts/crawler/src/audit-public-counts.js`
  - Adds `posters.public_non_fixed_deadlines` with id, title, source org, deadline type, dates, and exposure tier.

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
