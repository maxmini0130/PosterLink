# 2026-08-31 Query Search Includes Closed Posters

## Context

- Public search RPCs now support closed posters when `p_include_closed = true`.
- The public web UI still required users to explicitly enable `closed=include`.
- Requirement clarified: past notices should be searchable when a user enters a search query.

## Change

- Updated server-side public discovery so any sanitized search query sets `p_include_closed = true`.
- Updated client-side poster search so any non-empty query includes closed posters in RPC and count calls.
- Kept default no-query browsing behavior focused on active/open posters.
- Preserved semantic search by merging semantic results with keyword RPC results, ensuring closed exact matches are still included.
- Added migration `20260831020000_allow_public_read_closed_search_posters.sql` so public RLS can read exposed `closed` posters returned by search and detail pages.

## Validation

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `git diff --check`
- `pnpm test`
- Production read check before the new RLS migration:
  - Service-role RPC with `p_include_closed=true` finds the Gangseo English Library closed poster.
  - Anonymous public RPC still returns 0 because the existing `posters_select` RLS policy only allows `poster_status = 'published'`.

## Apply Note

- Migration `20260831020000_allow_public_read_closed_search_posters.sql` is prepared but must be applied to production after explicit approval.
