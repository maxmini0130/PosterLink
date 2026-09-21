# 2026-09-21 Home Discovery Links

## Context

- Google Search Console reported 134 `/regions/` URLs as discovered but not crawled.
- The home page linked to six top-level region pages but did not link directly to region-category collection pages.

## Changes

- Split the home route into a server page and the existing client experience.
- Added a server-side query for the 20 region-category combinations with the most currently accepting public posters.
- Added a visible `지역별 공고 모아보기` section with native text anchors.
- Kept the existing six top-level region links unchanged.
- Added an end-to-end assertion that the initial home HTML contains exactly 20 direct combination links.

## Validation

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm --dir apps/web test:e2e --grep "상위 지역·분야 링크"`
- `git diff --check`

## Operations

- No database writes or migrations were performed.
- After deployment, verify that the production home HTML contains at least 26 `/regions/` links.
