# 2026-09-01 Session Summary

## Scope

- Continued AI verification and launch follow-up work for PosterLink.
- Focused on public search correctness, category data quality, and production application records.

## Completed Work

- Added multi-select category support for posters.
- Reviewed and applied category corrections to existing production data.
- Investigated the Gangseo English Library poster search issue.
- Added a structured-field fallback for first-come single-day cultural event notices, so notices like Gangseo Gayang Library's 2026-09-16 movie screening can prefill application start/end and event start/end with the same event day when no explicit application period is present.
- Fixed public search RPC behavior so closed posters can be returned when explicitly included.
- Updated web search behavior so any non-empty query includes past/closed notices.
- Preserved active-first default browsing when there is no search query.
- Preserved semantic search by merging semantic results with keyword RPC results.
- Added and applied RLS migration allowing public reads of exposed `closed` posters.
- Verified the Gangseo English Library closed poster appears for:
  - `강서`
  - `서영`
  - `도서관`
  - `강서영어도서관`

## Production Apply Record

- Applied `20260831010000_include_closed_posters_in_public_search.sql`.
- Applied `20260831020000_allow_public_read_closed_search_posters.sql`.
- Confirmed anonymous public RPC search returns the target closed poster after RLS apply.

## Relevant Commits

- `4886b24 Support multi-select categories`
- `468e348 Apply reviewed category corrections`
- `929232d Fix closed poster public search`
- `2a5a9cc Document closed search production apply`
- `5f7675d Include closed posters in query search`
- `172ea87 Document closed search production apply`

## Validation Performed

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm test`
- `pnpm --filter posterlink-crawler test -- poster-structured-fields.test.js`
- `git diff --check`
- Production anonymous RPC read checks for the closed Gangseo English Library poster.
