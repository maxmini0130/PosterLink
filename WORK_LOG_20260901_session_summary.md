# 2026-09-01 Session Summary

## Scope

- Continued AI verification and launch follow-up work for PosterLink.
- Focused on public search correctness, category data quality, and production application records.

## Completed Work

- Added multi-select category support for posters.
- Reviewed and applied category corrections to existing production data.
- Investigated the Gangseo English Library poster search issue.
- Added a structured-field fallback for first-come single-day cultural event notices, so notices like Gangseo Gayang Library's 2026-09-16 movie screening can prefill application start/end and event start/end with the same event day when no explicit application period is present.
- Added structured-field extraction from readable OCR facts for open-ended first-come event notices, so the Gangseo Deungbit Library `곽재식 작가와의 만남` record keeps the application start date separate from the event date.
- Tuned category classification so an institution name like `사회복지관` does not overrule the actual program content; lifestyle repair/interior coaching programs now classify as `교육/취업` when the text is education/coaching-focused.
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
- Corrected `강서구립등빛도서관<곽재식 작가와의 만남>` in production:
  - category `지원금/복지` -> `문화/행사`
  - `application_start_at=2026-09-04`
  - `application_end_at=null`
  - `event_start_at=2026-09-15`
  - `event_end_at=2026-09-15`
  - `deadline_type=until_exhausted`
- Corrected `신길종합사회복지관 <일상생활 인테리어 코칭>` category in production from `지원금/복지` to `교육/취업`.
- Updated the production `field_verification.classification` audit metadata for both corrected records so internal review evidence matches the public category links.
- Removed the stale `지원금/복지` category links from both corrected records after verification showed the new category links had been added alongside the old ones.

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
- `pnpm --filter posterlink-crawler test -- poster-rules.test.js`
- `git diff --check`
- Production anonymous RPC read checks for the closed Gangseo English Library poster.
- Production read checks for the Gangseo Deungbit Library and Singil Social Welfare Center corrections.

## 2026-09-02 UI Follow-up

- Fixed the home notice feed tab rendering so the `popular` feed no longer relies on viewport-entry animation after a tab switch.
- Verified that clicking the `popular` tab keeps poster cards directly under the feed controls at a `770x918` viewport.

## 2026-09-02 UI Validation

- `pnpm --filter web lint`
- `pnpm --filter web build`
- `git diff --check`
- Local Playwright smoke check for the home `popular` feed tab.

## 2026-09-03 UI Follow-up

- Removed animation from the home notice feed grid entirely so feed tab clicks cannot leave hidden card rows in layout.
- Added stable test IDs for the home feed grid and category filters.
- Added a Playwright E2E regression test that clicks `deadline`, `recent`, and `popular` feed tabs at a `770x918` viewport and verifies cards stay directly below the controls.

## 2026-09-03 UI Validation

- `pnpm --filter web test:e2e -- home.spec.ts --project=chromium`
- `pnpm --filter web lint`
- `pnpm --filter web build`
