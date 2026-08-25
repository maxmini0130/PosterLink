# AI Content Type Routing

This is the Phase 5 foundation from `AI_VERIFICATION_SPEC.md`.

The implementation classifies each poster-like row into a feed routing type:

- `recruit`: user-facing opportunity/recruitment content
- `news`: retrospective news, result announcements, or informational updates
- `admin`: administrative notices such as hiring, bids, facility staffing, or public notices
- `discard`: duplicates, rejected rows, corrupted rows, or non-serviceable content

The routing is stored as `poster_field_evidence.content_type`. It can then be
used by exposure-tier computation to keep non-recruit rows in C tier while
preserving the source record and review history.

## Commands

Dry-run:

```bash
pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-dryrun.json
```

Apply after explicit approval:

```bash
pnpm content-type:backfill -- --limit=5000 "--statuses=published,review,rejected" --output=data/results/content-type-evidence-apply.json --apply
```

`--apply` upserts only `poster_field_evidence` rows with:

- `field_key = "content_type"`
- `extractor = "content-type-routing-v1"`

It does not change `poster_status`, `exposure_tier`, publication state, or any
public page directly.

## Current Rules

The first implementation is intentionally conservative:

- existing stored classification is honored when present
- `rejected` rows route to `discard`
- duplicate/corrupt/system quality issues route to `discard`
- known administrative notice issue codes route to `admin`
- known news/info issue codes route to `news`
- public restroom manager, hiring, bid, contract, and administrative notice
  titles route to `admin`
- retrospective result/news titles without application action route to `news`
- opportunity/program terms with application/recruitment action route to
  `recruit`

The rule layer is a gate, not a deletion mechanism. Ambiguous content defaults
to reviewable `recruit` with lower confidence until Phase 2 labels can tune the
thresholds.

## Public Routing Behavior

- Main discovery, home counts, semantic search, recommendation, region pages,
  and category pages continue to use public exposure tiers A/B.
- Sitemap includes public feed posters plus published archive posters that have
  `content_type` evidence of `news` or `admin` with confidence `>= 0.8`.
- `discard` remains out of the sitemap unless a future human-reviewed archive
  policy explicitly allows it.
