# 2026-08-29 Review Queue Release

## Summary

- Backfilled `poster_field_evidence` for the remaining review queue.
- Recomputed exposure tiers and auto-published all remaining review posters that passed the Phase 3 A-tier gate.
- Added two repeatable correction scripts for review queue release decisions.

## Production DB Changes

- Applied review evidence backfill for 23 review posters:
  - `evidence:backfill -- --statuses=review --limit=5000 --apply`
  - `poster-detection:backfill -- --statuses=review --limit=5000 --apply`
  - `content-type:backfill -- --statuses=review --limit=5000 --apply`
- Recomputed review exposure tiers and auto-published the first safe A-tier group:
  - 13 posters published.
- Applied `review-safe-release-corrections-v1`:
  - 5 poster updates.
  - 1 contest category correction.
  - 9 evidence rows.
- Recomputed tiers and auto-published the safe corrected group:
  - 5 posters published.
- Applied `review-final-release-corrections-v1`:
  - 5 poster updates.
  - 10 evidence rows.
  - Cleared one false duplicate suspicion where the suspected duplicate was a different notice candidate from the same organization.
- Recomputed tiers and auto-published the final corrected group:
  - 5 posters published.

## Final Audit

- Public search count: 218.
- Public search returned rows: 218.
- Search count match: true.
- Poster statuses:
  - `published`: 518
  - `review`: 0
  - `rejected`: 56
  - `closed`: 1773
- Public search exposure tiers:
  - A: 211
  - B: 7
- Date-period audit for `review,published`:
  - audited: 518
  - stale warning: 0
  - mismatch: 0
  - missing clear deadline: 0
  - actionable: 0
- Notification audit after publishing:
  - `new_match` pending: 414
  - sendable: 19
  - no-token: 395
  - `favorite_deadline` pending: 0

## Notes

- The remaining review queue is now empty.
- New `new_match` notification rows were created by publishing the final review posters. Most target users have no push token, so they remain pending until push-token handling or backlog policy is addressed.
