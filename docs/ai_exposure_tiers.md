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

## Current Safety Position

The default thresholds are conservative provisional values until Phase 2 has 120
reviewed labels. `is_real_poster` is treated as a required critical field, so
current rows remain C until Phase 4 creates reliable poster-detection evidence
or a human label writes that field.

This is intentional. Phase 3 can report gates and blockers now, but should not
turn on automatic publishing before Phase 2 thresholds and Phase 4 poster
detection are ready.

