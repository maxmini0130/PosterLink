# 2026-08-24 Poster image dimension probe

## Context

The `needs_vlm` poster-detection backlog remained high after the first VLM
batch. A review of the dry-run output showed that many ambiguous images lacked
stored width and height, so the rule engine could not use geometry safely.

## Change

- Exported the existing image header probe helper from `poster-image-rules.js`.
- Added optional `--probe-missing-dimensions` support to
  `backfill-poster-detection-evidence.js`.
- Added `--probe-limit=0` to cap network probes during dry-runs or batch
  analysis. `0` means no cap.
- Recomputes poster-detection signals after dimensions are probed.
- Added `ocrTextLength` to poster-detection signals.
- Prevented `low_text_density` from rejecting images when OCR text is absent.
  This avoids turning dimension-only probes into false negative poster
  decisions.

## Dry-run result

Default dry-run command:

```bash
pnpm --filter posterlink-crawler poster-detection:backfill -- --limit=5000 "--statuses=published,review" --output=data/results/poster-detection-probe-default-dryrun.json
```

Result:

- checked: 550
- evidence rows: 278
- true: 277
- false: 1
- ambiguous: 272
- probed images: 0

Probe dry-run command:

```bash
pnpm --filter posterlink-crawler poster-detection:backfill -- --limit=5000 "--statuses=published,review" --probe-missing-dimensions --probe-limit=80 --output=data/results/poster-detection-probe80-dryrun.json
```

Result:

- checked: 550
- evidence rows: 278
- true: 277
- false: 1
- ambiguous: 272
- needs VLM: 272
- probed images: 80

## Verification

- `pnpm --filter posterlink-crawler test`
  - 189 tests passed.

## Production note

No operating DB write was performed. The new probe option is a dry-run and batch
analysis aid unless `--apply` is explicitly used after separate approval.
