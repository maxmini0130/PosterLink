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

## 2026-09-03 Production Apply

- Deployed the verified home feed tab fix directly to Vercel production because the previous push only updated the feature branch.
- Production deployment `dpl_EAXosnfrSPq2jg9xa5b8CT1iYvLc` reached `READY` and was aliased to `https://www.posterlink.kr`.
- Re-ran `pnpm --filter web test:e2e -- home.spec.ts --project=chromium` with `E2E_BASE_URL=https://www.posterlink.kr`; all 11 home E2E tests passed against production.

## 2026-09-03 Full E2E Audit

- Ran the full web Playwright suite locally: first pass found 7 failures, then targeted fixes and a full rerun completed with 117 passed, 2 skipped, 0 failed.
- Fixed a real `/admin/posters` crash where empty category filters could call `.trim()` on `undefined`.
- Hardened the public institution SEO E2E so it no longer assumes `mapo-gu` always has public poster links.
- Verified:
  - `pnpm test -- apps/web/lib/adminPosterFilters.test.ts`
  - `pnpm --filter web test:e2e -- seo.spec.ts authenticated/admin/review.spec.ts --project=chromium --project=admin`
  - `pnpm --filter web test:e2e`
  - `pnpm --filter web lint`
  - `pnpm --filter web build`

## 2026-09-03 Production Full E2E

- Deployed `bfe108f` to Vercel production.
- Production deployment `dpl_6LM5CPXUoXB5r1EAkxUE8GTCzKBi` reached `READY` and was aliased to `https://www.posterlink.kr`.
- Ran the full Playwright suite against production with `E2E_BASE_URL=https://www.posterlink.kr`: 116 passed, 3 skipped, 0 failed.

## 2026-09-03 Mapo History Exploration Structured Fields

- Confirmed the Mapo source notice for `2026년 마포구 청소년 역사유적 탐방 참가자 모집 안내` includes:
  - application period `2026. 9. 1.(화) ~ 9. 6.(일)`
  - `선착순 접수`
  - event date `2026. 9. 12.(토) 9:00 ~ 16:00`
  - venue `수원화성 일대`
  - target/capacity `관내 초등학생 4~6학년 48명`
- Updated the production review row `526ba446-60c9-4033-9854-a163c6c2a860` with deadline type, application dates, event dates, grade-derived age range, capacity, eligibility, and venue.
- Hardened structured field extraction for source-grounded labeled fields:
  - yearless month/day dates with a nearby year hint
  - multiple application-period labels, preferring a complete range over a generated deadline-only summary
  - labeled event dates such as `탐방일시`
  - grade-to-age range mapping
  - labeled capacity extraction
  - labeled event venue extraction
  - first-come deadline type only when supported by exhaustion wording, open-ended first-come wording, or capacity evidence
- Extended structured backfill selection so event dates, age range, and capacity can be carried through future backfill plans.
- Scanned 47 current review rows for the strict same pattern `school grade + capacity + first-come + event/venue label`; only the Mapo history exploration notice matched, and it was already corrected.

Validation:

- `pnpm --filter posterlink-crawler test -- poster-structured-fields.test.js` (303 passed)
- `git diff --check`

## 2026-09-03 Welfare Rights Counseling Structured Fields Follow-up

- Confirmed `사회복지종사자 권익지원센터 <사회복지종사자 집단상담 - 숨비소리> 참여자 모집` was missed because the previous strict similar-case scan only looked for the `school grade + capacity + first-come + event/venue label` pattern.
- Confirmed the source notice contains:
  - application period `2026년 9월 3일(목) ~ 9월 20일(일)`
  - program period `2026년 10월 6일(화) ~ 11월 24일(화)`
  - venue `어텀인남산 (서울 용산구 만리재로186 3층)`
  - target/capacity `부장·국장·시설장 급을 제외한 사회복지종사자 5명`
- Updated production review row `501bded9-c2f0-4551-8a13-e356d5086699` with organizer, fixed deadline type, application dates, event dates, eligibility, capacity, and venue.
- Hardened structured field extraction for attached-label program notices such as `📆일정2026...`, `🚩장소...`, `🎯대상...`, and `📢모집기간...`.
- Added a regression test for the counseling program pattern and preserved the Mapo history exploration regression.

Validation:

- `pnpm --filter posterlink-crawler test -- poster-structured-fields.test.js` (304 passed)

## 2026-09-03 Poster Detail Age Fallback Fix

- Confirmed poster `519b551c-dc16-4619-84e6-c351b40e51ee` already had no structured `target_age_min` / `target_age_max` in the database, but the public detail page rendered `만 0세 ~ 20세`.
- Root cause: the detail-page summary fallback could still supply an age even when trusted `eligibility_summary` existed, and the fallback age parser accepted numeric ranges without requiring the Korean age marker `세`, allowing dates/times such as `00:00 ~ 2026...` to be misread as ages.
- Updated the poster detail page to derive fallback age only from the structured eligibility text when that text exists.
- Hardened age extraction so ranges must explicitly be age ranges and invalid reversed ranges are ignored.
- Added regressions for date/time text and `누구나` eligibility text.

Validation:

- `pnpm test -- apps/web/lib/posterSummaryFacts.test.ts` (61 passed)
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `git diff --check`
