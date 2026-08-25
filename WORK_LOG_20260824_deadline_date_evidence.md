# 2026-08-24 Deadline Date Evidence

## Context

- Exposure tier dry-run still reported many `critical_missing_deadline_date`
  and `critical_low_confidence_deadline_date` blockers.
- Existing `regex-date-v1` evidence is conservative and drops to low confidence
  when field verification marks `deadlineMatches=false`, even when
  `dateQuality.suggestedDeadline` or the original application period supports
  the same date.

## Changes

- Added `scripts/crawler/src/deadline-date-evidence.js`.
- Added `deadline-date-grounded-v1` evidence generation from:
  - `field_verification.dateQuality.suggestedDeadline`.
  - explicit application/recruitment period ranges.
  - generated period summaries only when the title/segment indicates recruitment.
- Integrated the rule into `backfill-field-evidence.js`.
- Added focused tests for suggested deadlines, explicit ranges, generated
  recruitment summaries, event-period rejection, and open-ended deadline rejection.

## Safety

- The rule does not update `posters.application_end_at`.
- Open-ended wording such as always-open, exhausted budget, first-come deadline,
  or "until recruitment closes" is not converted to a fixed deadline date.
- DB writes still require a separate approved `--apply` run.

## Grounded Period Summary Rule

Added a narrower fallback for rows where the summary has a Korean period segment
with an application cue, for example `기간: ... ~ ... · 신청: ...`, and
`field_verification.dateQuality.normalizedDeadline` or `extractedDeadline`
matches the end date of that segment.

Safety constraints:

- The segment must include a Korean period label such as `기간:`.
- The same segment must include an application/recruitment cue such as `신청`,
  `접수`, `모집`, `지원`, or `참여`.
- The normalized deadline must equal the end date of the range.
- Open-ended wording remains excluded.

Verification:

- `node --test scripts/crawler/src/deadline-date-evidence.test.js scripts/crawler/src/deadline-type-evidence.test.js`
  - Passed: 18 tests.
- `pnpm --filter posterlink-crawler test`
  - Passed: 192 tests.
- Dry-run:
  `pnpm --filter posterlink-crawler evidence:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/field-evidence-after-grounded-period-rule-dryrun.json`
  - `deadline_date`: 536 -> 548
  - `deadline_type`: 278 -> 299

Prepared but did not apply:

- `data/results/grounded-period-deadline-evidence-safe-13-dryrun.json`
- Candidate rows: 13
  - `deadline_date`: 12
  - `deadline_type`: 1
- Expected tier dry-run impact if applied:
  - A: 167 -> 176
  - B: 3
  - C: 372 -> 363
  - calendar/deadlineAlert gate: 115 -> 126
  - `critical_low_confidence_deadline_date`: 115 -> 105
