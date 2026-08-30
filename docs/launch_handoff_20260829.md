# PosterLink Launch Handoff - 2026-08-29

## Scope

This handoff summarizes the work completed after the previous release commits on the AI verification and launch-quality branch.

Branch:

- `feat/ai-verification-phase-1`

Latest commits:

- `47b7e55` - `Fix date period audit and search log mojibake`
- `00da011` - `Add review queue release corrections`

## Completed Work

### Date and Period Quality

- Re-audited application period vs event/education period mapping.
- Fixed user-reported cases where event dates were incorrectly treated as application deadlines.
- Added manual correction flow for verified application-period mappings.
- Ensured manually accepted date corrections are not repeatedly surfaced as false-positive mismatch warnings.
- Re-ran the date-period audit for `review,published` posters.

Final audit result:

- Audited posters: 518
- Stale date warning: 0
- Deadline mismatch: 0
- Missing clear deadline: 0
- Actionable issues: 0

### Search Logs

- Investigated why popular search keywords were blank or unreadable.
- Added a repair script for mojibake search keyword rows.
- Repaired existing broken search keywords in production.
- Hardened the search log API to normalize recoverable mojibake input before saving new logs.

### Review Queue Release

- Backfilled AI field evidence for all remaining review posters.
- Backfilled poster detection evidence for review posters.
- Backfilled content-type routing evidence for review posters.
- Recomputed exposure tiers for the review queue.
- Added repeatable correction scripts:
  - `pnpm --filter posterlink-crawler apply:review-safe-release-corrections`
  - `pnpm --filter posterlink-crawler apply:review-final-release-corrections`
- Corrected known safe review blockers:
  - Missing-year deadline parser errors, such as 2023 dates on current 2026 Youth Seoul notices.
  - `unknown` deadline type where a fixed application/submission period was clearly present.
  - Low-confidence content type for clear recruitment, application, contest, or open public opportunity posts.
  - One false duplicate suspicion where the suspected duplicate was a different notice candidate from the same organization.
- Auto-published all review posters that passed the A-tier gate.

Final review queue result:

- `published`: 518
- `review`: 0
- `rejected`: 56
- `closed`: 1773

### Public Count Consistency

- Re-ran public count audit after the review queue release.

Final public count audit:

- Public search count: 218
- Public search returned rows: 218
- Count match: true
- Public exposure tiers:
  - A: 211
  - B: 7
- Public deadline types:
  - `fixed`: 195
  - `until_exhausted`: 9
  - `unknown`: 6
  - `ongoing`: 8

### Notifications

- Cleaned old push-notification backlog before the review queue release.
- Re-audited notifications after new posters were published.

Current notification audit:

- `new_match` pending: 414
- Sendable rows: 19
- No-token rows: 395
- Opted-out rows: 0
- Missing-profile rows: 0
- `favorite_deadline` pending: 0

Interpretation:

- The pending rows are not data-quality failures.
- Most pending rows cannot be pushed because the target users have no registered push token.
- The 19 sendable rows should be handled by the normal notification sender flow.

## Verification Commands Run

```bash
pnpm --filter posterlink-crawler test
pnpm --filter web lint
git diff --check --cached
pnpm --filter posterlink-crawler audit:public-counts
node scripts/crawler/src/audit-date-period-mapping.js --statuses=review,published
pnpm --filter posterlink-crawler audit:notifications
```

Results:

- Crawler tests: 260 passed.
- Web lint: passed.
- Whitespace check: passed.
- Public count audit: passed.
- Date-period audit: passed.

## Remaining Work

### 2026-08-29 Follow-up Snapshot

Read-only audits were re-run after this handoff was first written.

- Public count remains consistent: 218 counted, 218 returned.
- New production ingestion/review activity added 3 posters back to `review`.
- Date-period audit now has 1 stale warning on a review poster and 0 mismatches.
- The 3 review posters currently have no `poster_field_evidence`, so dry-run tiering keeps all 3 at C and auto-publish finds 0 eligible.
- Notification audit still shows 414 pending `new_match` rows: 19 sendable and 395 no-token.
- `audit:notifications` now writes sendable target details to `data/eval/reports/notification-push-audit.json`.
- `audit:public-counts` now writes the 23 public non-fixed deadline rows under `posters.public_non_fixed_deadlines`.

### P0 - Notification Delivery Follow-up

- Added a scriptable notification sender path:
  `pnpm --filter posterlink-crawler notifications:send-pushes -- --type=new_match --limit=500`.
- Dry-run confirms the current `new_match` backlog has 414 pending rows: 19 sendable and 395 without push tokens.
- Actual sending remains a deliberate operator action requiring both `--apply` and `SEND_NOTIFICATION_PUSHES=true`.
- The admin poster approval UI still calls `notify-new-match`; scripted auto-publish does not send pushes by itself.
- Decide backlog policy for no-token rows:
  - Keep until users install/sign in to the app and register tokens.
  - Or mark old no-token rows as skipped after a retention window.
- After Android app rollout, verify push-token registration from real devices.

### P0 - Google Play Developer Verification

- Wait for Google Play Console identity verification to finish.
- Complete contact phone-number verification once Google unlocks the next step.
- Then proceed with:
  - App creation.
  - Store listing.
  - Data safety form.
  - Internal testing.
  - Closed/open testing as required.
  - Production review submission.

### P1 - Public Non-Fixed Deadline Review

- Review public posters with:
  - `deadline_type = unknown` - 6 public rows.
  - `deadline_type = ongoing` - 8 public rows.
  - `deadline_type = until_exhausted` - 9 public rows.
- Listing/detail copy now avoids confident fixed D-day labels for explicit non-fixed deadlines:
  - `ongoing`: `상시 모집`
  - `until_exhausted`: `소진 시 마감`
  - explicit `unknown` with an end date: active, but marked `일정 확인 필요`
- Remaining manual check: confirm whether each of the 23 public non-fixed rows should stay public or receive a structured-data correction.

### P1 - Browser QA for Newly Published Posters

- Spot-check newly published posters in production:
  - Search/list page card.
  - Detail page.
  - Admin detail.
  - Calendar/deadline alert display.
- Confirm user-facing copy separates:
  - Application/recruitment period.
  - Event/class/experience period.
  - Announcement/interview dates.

### P1 - Search Analytics Dashboard

- Confirm popular search keywords now appear in the admin dashboard.
- If admin/internal traffic is intentionally excluded, add visible dashboard copy explaining that exclusion.

### P1 - Android Launch Assets

- Prepare or verify:
  - App icon.
  - Feature graphic.
  - Screenshots.
  - Short and full descriptions.
  - Privacy policy URL.
  - Account deletion URL.
  - Contact email.

### P2 - AI Verification UX Improvements

- Continue improving review tips so every warning card explains:
  - Which stored value is being questioned.
  - Which source evidence conflicts or supports it.
  - What the reviewer should check.
- Keep using the pattern requested by the operator:
  - Example: "Thumbnail says one date, body says another. Please confirm the application deadline."

### P2 - Rule Hardening

- Add more tests for:
  - Missing-year Youth Seoul dates.
  - Application period vs event period.
  - Contest category mapping.
  - Same organization and same deadline but different program duplicate false positives.
  - Open public events that should still be treated as actionable opportunities.

### P2 - Threshold Rollout Coverage

- Threshold export now keeps low-coverage recommendations out of the copyable applied threshold map.
- Content-type routing candidate now evaluates cleanly against the 120-row golden set when dry-run evidence is supplied through `eval:extraction --extra-evidence`.
- Phase 2 candidate threshold export is now production-ready with no blockers:
  `data/eval/reports/extraction-thresholds-phase2-candidate-20260830.json`.
- Candidate critical-field metrics: `content_type` precision/coverage `1.0/1.0`,
  `deadline_date` `0.9867/0.625`, `deadline_type` `1.0/0.6`.
- Operating defaults remain conservative at `0.9`; generated recommendations
  below the default do not lower production thresholds automatically.

## Operational Notes

- Production DB write operations in this phase were applied only after user approval.
- Phase 2 evidence backfills and exposure tier recomputation were applied after
  explicit user approval on 2026-08-30:
  - `content_type` evidence upserted `2350` rows, failed `0`.
  - field evidence upserted `16582` rows, failed `0`.
  - exposure tiers recomputed for `518` published/review rows, failed `0`.
  - post-apply public audit returned `137` public posters and matched search count.
- No poster status changes or auto-publish actions were performed during the
  Phase 2 production apply.
- Review queue follow-up was then applied after user requested remaining work:
  - review-only content-type evidence applied `3` rows, failed `0`.
  - review-only field evidence applied `38` rows, failed `0`.
  - review-only exposure tiers became `A 2`, `C 1`.
  - A-tier auto-publish applied `2` rows with audit failures `0`.
  - final public audit returned `139` public posters and matched search count.
  - final review queue count is `1`; the remaining row is C-tier and blocked
    by duplicate/low-confidence poster-image evidence.
- No secrets should be copied into logs, commits, or final reports.
- The review queue is currently empty, so the next operational focus should be Android approval and notification delivery.
