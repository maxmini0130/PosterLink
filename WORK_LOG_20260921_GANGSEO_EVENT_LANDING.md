# 2026-09-21 Gangseo Event Landing SEO Experiment

## Context

- The proposed `/regions/[region]/[category]` collection route already existed in production.
- The production sitemap exposed 94 region-category combinations and 129 total region URLs.
- Existing district pages used a hierarchical region scope, so a district landing could include posters linked only to its parent province or city.

## Decision

- Use the densest non-national exact region-category combination for the first focused experiment.
- Public read-only aggregation on 2026-09-21 found `Gangseo-gu x event recruitment` with 12 active posters.
- Keep existing discovery behavior unchanged and use exact region matching only for this experiment page.

## Changes

- Enriched `/regions/seoul-gangseo/event-recruit` with:
  - a month and live count in metadata;
  - two unique explanatory paragraphs;
  - exact Gangseo-gu filtering;
  - links to adjacent region and category collections.
- Added an SEO end-to-end assertion for server-rendered content and poster links.

## Validation

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --dir apps/web test:e2e --grep "강서구 행사모집"`
- `git diff --check`

## Operations

- No database writes or migrations were performed.
- After deployment, submit `https://www.posterlink.kr/regions/seoul-gangseo/event-recruit` through Google Search Console URL inspection.
