# AI Exposure Tiers

This is the Phase 3 foundation from `AI_VERIFICATION_SPEC.md`.

The implementation computes A/B/C exposure tiers from `poster_field_evidence`
without changing `poster_status` or enabling auto-publish.

## Commands

Dry-run:

```bash
pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-dryrun.json
```

Apply only the cached tier columns after explicit approval:

```bash
pnpm tier:compute -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/exposure-tier-apply.json --apply
```

`--apply` updates only:

- `posters.exposure_tier`
- `posters.tier_computed_at`
- `posters.tier_reason`

It does not auto-publish, hide, reject, or otherwise change `poster_status`.

## Auto-Publish Planner

Phase 3 auto-publish is implemented as a separately gated planner. It reads
review posters with existing exposure tiers and writes a candidate report by
default.

Dry-run:

```bash
pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-dryrun.json
```

Launch-window default:

- only `poster_status = 'review'` rows are considered
- only tier A is eligible unless `--tiers=A,B` is explicitly supplied
- rows without `tier_computed_at` are blocked
- no write occurs without `--apply`

Applying is intentionally double-locked and must be explicitly approved before
use:

```bash
EXPOSURE_AUTO_PUBLISH=true pnpm tier:auto-publish -- --output=data/eval/reports/auto-publish-plan-apply.json --apply
```

When applied, the script changes eligible rows to `poster_status = 'published'`
and writes an `admin_actions` audit row with
`action_reason = 'auto_publish_exposure_tier'`.

## Current Safety Position

The default thresholds are conservative provisional values until Phase 2 has 120
reviewed labels. `is_real_poster` is treated as a required critical field, so
non-poster or weakly grounded rows remain blocked from tier A.

This is intentional. Phase 3 can report gates and auto-publish candidates now,
but status-changing apply mode must remain an explicit operating decision during
the launch safety window.
