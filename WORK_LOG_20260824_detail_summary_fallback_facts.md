# 2026-08-24 detail summary fallback facts

## Issue

- Some public poster detail pages had explicit target, benefit, application, or fee information in the official summary/body section, but the "핵심 신청 조건" card still showed fallback text such as "공식 공고 확인 필요" or "정보 확인 중" when structured DB fields were empty.
- A structured backfill dry-run with user-facing text enabled checked 550 rows but found only 1 safe candidate, and no target/benefit candidates. The remaining issue was therefore mainly display fallback coverage, not a broad safe DB backfill.

## Fix

- Added `apps/web/lib/posterSummaryFacts.ts`.
- The helper only derives fallback facts from explicit summary labels such as `신청대상`, `참여혜택`, `신청방법`, and `비용`.
- The poster detail "핵심 신청 조건" card now uses those labeled summary facts when the corresponding structured DB column is empty.
- The age row can derive a simple age range from a labeled `신청대상`/`대상` summary, while still preferring DB `target_age_min` and `target_age_max`.

## Verification

- `pnpm --filter posterlink-crawler structure:backfill -- --limit=5000 --include-user-facing-text --output=data/results/structured-poster-backfill-user-facing-dryrun.json`
- `pnpm --filter web exec tsc --noEmit --pretty false`
- `pnpm test -- posterSummaryFacts`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `git diff --check`

## Notes

- No operating DB writes were made.
- GitHub CLI was not available on the current shell PATH, so Daily Crawler workflow status still needs to be checked from GitHub Actions or a shell where `gh` is available.
