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
