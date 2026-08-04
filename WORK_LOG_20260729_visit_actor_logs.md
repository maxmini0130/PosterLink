# Visit Actor Logging Work Log - 2026-07-29

## Problem

The recent-visit table stored a signed-in `user_id` and User-Agent, but did not
resolve the user's role or record browser automation signals. An administrator
visit therefore appeared only as `user:<id>`, and an AI-controlled browser
using a normal Chrome User-Agent could look like ordinary traffic.

## Implementation

- Added separate visit dimensions for:
  - actor: visitor, member, operator, administrator, automation, or bot
  - execution: human or automated
  - automation source: explicit AI/E2E marker, WebDriver, automation User-Agent,
    or bot User-Agent
- The server resolves authenticated roles from `profiles`; the client cannot
  claim an administrator role.
- The public table INSERT policy accepts only the default visitor/human actor
  context. The server-side service-role endpoint is the only path that can
  persist staff or automation classifications.
- The browser tracker records `navigator.webdriver`.
- `_pl_automation=codex-ai-review` or another explicit source is retained for
  the current browser session and displayed with a specific automation label.
- The traffic API resolves nicknames for signed-in staff and returns an actor
  breakdown for the selected period.
- The admin traffic page now provides:
  - period actor breakdown
  - actor and automation badges on every recent visit
  - filters for visitors, members, staff, and automated traffic

## Database

Applied migration:

`supabase/migrations/20260729000000_add_site_visit_actor_context.sql`

The migration adds `actor_type`, `is_automated`, and `automation_source`,
indexes actor/automation queries, and backfills identifiable historic rows.

Migration-time audit of the latest 80 rows:

- administrator: 4
- identifiable automated browser: 42
- ordinary or historically unidentifiable visitor: 34

The 42 automated rows used HeadlessChrome and were backfilled as
`automation-user-agent`. Existing administrator rows were resolved from the
`super_admin` profile.

Historic automation that used a normal Chrome User-Agent cannot be identified
with certainty because WebDriver was not stored at that time. New normal-Chrome
Playwright visits were verified as `is_automated=true` and
`automation_source=webdriver`.

## Verification

- site visit classification and web config tests: 19/19 passed
- crawler regression tests: 92/92 passed
- web production build: passed
- remote Supabase migration: applied
- anonymous direct INSERT with `actor_type=admin`: blocked by RLS (`42501`)
- anonymous default visitor INSERT: allowed and removed after verification
- explicit `codex-ai-review` API visit stored as automation and the test row was
  removed after verification
- legacy-column fallbacks retained for rolling deployment
- authenticated traffic E2E specification added
- visual E2E execution is pending because the configured E2E administrator
  credentials currently return `Invalid login credentials`

## Follow-up

- [x] Store authenticated role and automation context separately
- [x] Backfill identifiable administrator and automated visits
- [x] Show actor breakdown, badges, and filters in the admin traffic page
- [x] Verify normal-Chrome WebDriver visits are recorded as automation
- [ ] Refresh the E2E administrator credential
- [ ] Rerun the authenticated traffic screenshot test after credential refresh

## 2026-08-04 Follow-up: Public Traffic Scope and Today Default

### Request

- Exclude administrators, operators, automated inspections, and bots from the
  primary visit statistics.
- Keep an explicit option to include internal traffic for operational review.
- Show the current Korea calendar day by default.

### Implementation

- Changed the default period from 30 days to `today`.
- Period queries now start at midnight in `Asia/Seoul`; a one-day query no
  longer means the rolling previous 24 hours.
- Added `include_internal` to the admin traffic API. Its default is `false`.
- The external scope includes only non-automated `visitor` and `member`
  traffic. Staff roles and every automated visit are excluded before source,
  platform, page, daily, actor, and recent-log aggregation.
- Added an `내부·자동 포함` switch. Staff and automation log filters appear
  only while that scope is enabled.
- Added a filtered identity-overview RPC so all-time and selected-period totals
  use the same scope as the detailed aggregates.
- Added the number of excluded period rows to the API and scope metadata.

### Database

Applied migration:

`supabase/migrations/20260804026000_add_filtered_traffic_overview.sql`

The function uses current profile roles plus stored and detected automation
signals. Period and today boundaries use Korea time.

### Verification

- monorepo unit tests: 53/53 passed
- web lint: passed with no warnings or errors
- web production build and TypeScript check: passed
- remote Supabase migration: applied
- filtered and internal-included overview RPC calls: both returned 200
- 2026-08-04 public traffic at verification time: 4 visitors, 7 sessions,
  15 pageviews
- 2026-08-04 internal-included traffic at verification time: 9 visitors,
  62 sessions, 115 pageviews
- authenticated traffic E2E remains skipped after session setup because the
  configured administrator credential redirects back to login

### Follow-up

- [x] Default to today's Korea-time statistics
- [x] Exclude administrators, operators, automated inspections, and bots
- [x] Allow internal traffic to be included explicitly
- [x] Apply and verify the filtered overview function in production
- [ ] Refresh the E2E administrator credential and rerun the visual test
