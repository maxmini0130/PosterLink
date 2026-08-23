# 2026-08-24 public count and search log follow-up

## Issue

- Home showed 217 accepting posters, but `/posters` showed `총 60건` because the public search RPC/default fetch limit was leaking into the result-count label.
- Home institution count used active/planned collection sources, while `/institutions` and sitemap used public institutions.
- Popular keywords stayed empty after browser searches because `search_logs` had no rows; the existing client-side RPC path did not leave observable logs for the dashboard.

## Fix

- Added `public.count_public_posters(...)` and raised `public.search_public_posters(...)` default/cap so public discovery can separate exact total count from loaded list size.
- Updated `/posters` SSR structured data and client label to use exact total count, and changed the pagination copy to describe only the already loaded list.
- Changed the home summary institution count to public `institutions.is_public = true` and changed the label to `공개 기관 N개`.
- Added `POST /api/search-logs` so browser searches can be logged through a server route using the service role, then call it from explicit searches and initial `/posters?q=...` landing.

## Verified

- Operating DB before fix: published 554, accepting 217, public institutions 97, active/planned collection sources 96, search logs 0.
- `pnpm dlx supabase db push --linked` applied `20260824020000_fix_public_counts_and_search_logging.sql`.
- `pnpm dlx supabase db lint --linked` passed.
- `pnpm --filter web exec tsc --noEmit --pretty false` passed.
- `pnpm --filter web lint` passed.
- `pnpm test` passed.
- `pnpm --filter web build` passed.
- Local `GET /api/home/summary` returned `activePosters: 217` and `collectionSources: 97`.
- Local `/posters` HTML contained the exact count value `217`.
- Local `POST /api/search-logs` inserted `posterlink-check`, and `get_popular_keywords` returned that keyword with count 1.

## Still open

- Detail-page structured field backfill remains open for records whose body contains age/benefit information but cards still show `확인 필요`.
- UUID slug improvement remains optional/open.
- `오늘 새 공고 0건` should be rechecked after the next weekday crawler run before treating it as a bug.
