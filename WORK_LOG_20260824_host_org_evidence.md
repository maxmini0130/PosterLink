# 2026-08-24 Host Organization Evidence

## Context

- Exposure tier dry-run still reported many `critical_low_confidence_host_org`
  blockers.
- Samples showed many rows where the organizer value was plausible but the
  evidence confidence was reduced by unrelated date/category/summary issues.

## Changes

- Added `scripts/crawler/src/host-org-evidence.js`.
- Added `host-org-grounded-v1` evidence generation for host organization names
  grounded directly in the title or body text.
- Integrated the rule into `backfill-field-evidence.js`.
- Added tests for title-prefix, title-body, body-grounded, and generic portal
  exclusion behavior.

## Safety

- Generic collection portals such as `청년몽땅정보통`, `통합청년`, and
  `K-Startup` are not promoted as host organizations by this rule.
- The rule does not change `source_org_name`, `organizer_name`, poster status, or
  exposure tier.
- DB writes still require a separate approved `--apply` run.
