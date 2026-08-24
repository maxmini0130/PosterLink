# AI Poster Detection

This is the Phase 4 foundation from `AI_VERIFICATION_SPEC.md`.

The first implementation converts cheap image geometry/text signals and existing
image classification results into `poster_field_evidence.is_real_poster`
candidates.

## Commands

Dry-run:

```bash
pnpm poster-detection:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/poster-detection-evidence-dryrun.json
```

Apply after explicit approval:

```bash
pnpm poster-detection:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/poster-detection-evidence-apply.json --apply
```

`--apply` upserts only `poster_field_evidence` rows with:

- `field_key = "is_real_poster"`
- `extractor = "poster-detection-signals-v1"`

It does not change `poster_status` or `exposure_tier`.

## Signals

The current rule layer computes:

- aspect ratio
- megapixels
- OCR/source text density
- title overlap
- date token presence
- contact token presence
- existing image-classifier decision

Immediate deterministic routes:

- reject tiny images
- reject wide banner-like images
- reject very low text-density images unless the existing classifier already
  accepted them
- accept high-confidence existing classifier positives
- accept strong portrait/text/date-title signal combinations

Ambiguous rows are left as `needs_vlm`.

## Current Dry-Run Result

On 2026-08-24:

- checked posters: 550
- `is_real_poster=true` candidates: 258
- `is_real_poster=false` candidates: 0
- ambiguous / needs VLM: 292

The first pass intentionally avoids producing negative evidence from weak
signals. This prevents accidental demotion of real posters before Phase 2 labels
and Phase 4 golden-set measurements are available.

