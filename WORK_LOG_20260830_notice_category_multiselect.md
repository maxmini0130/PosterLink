# 2026-08-30 Notice Candidate Category Multi-Select

## Summary

- Changed the admin notice candidate edit form category field from a single text input to a multi-select category chip control.
- Reused the same multi-select control in the template poster maker modal.
- Changed the admin poster review list category filter to support selecting multiple categories.
- Multi-category poster filtering uses OR semantics across selected categories.
- Kept `category_name` as a display/legacy summary label while sending selected `category_codes` during candidate-to-poster conversion.
- Extended the notice candidate list API response to include category options from `categories`.
- Extended the convert API to accept `category_codes` as JSON or comma-separated FormData values.
- When `category_codes` are provided, they override AI-inferred categories for `poster_categories`; otherwise, existing AI/category label fallback behavior remains.
- Added comma/slash/pipe/middle-dot parsing for legacy `category_name` strings during conversion.

## Validation

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `git diff --check`
