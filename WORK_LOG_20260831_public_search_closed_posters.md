# 2026-08-31 Public Search Closed Posters

## Finding

- Investigated why the Gangseo English Library poster was not searchable.
- The poster exists as `19444f77-f9a4-441b-bcd8-d33d1b71569d`.
- It is `poster_status = closed`, `application_end_at = 2026-07-04T00:00:00+00:00`, and `exposure_tier = null`.
- Default public search correctly hides it because it is closed.
- The bug is that `search_public_posters` and `count_public_posters` still hard-filter `poster_status = 'published'`, so `closed=include` cannot return closed posters.

## Change

- Added migration `20260831010000_include_closed_posters_in_public_search.sql`.
- Default behavior remains published active posters.
- When `p_include_closed = true`, the RPC now includes `poster_status = 'closed'` rows that pass public exposure gating.

## Validation

- Production read check before migration:
  - `search_public_posters('강서영어도서관', includeClosed=false)` returned 0.
  - `search_public_posters('강서영어도서관', includeClosed=true)` also returned 0 because of the RPC status filter.
- `git diff --check`

## Apply Note

- Production DB migration is not applied in this work log yet.
- Apply the migration after explicit production DB approval.
