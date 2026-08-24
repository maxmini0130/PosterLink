# 2026-08-24 operator review flow fixes

## Issue

- Operator-created posters could not be approved from the admin review screen when the official notice URL existed only in `poster_links`.
- The admin approval checklist checked `posters.source_key`, but the operator create/edit flow stores the "official notice" URL in `poster_links`.
- The approval failure toast did not explain the concrete blocking detail clearly enough.
- The operator create submit button had poor visible contrast in the reported browser state.
- Missing-image validation appeared only as a top toast, far away from the submit button.
- Operator list category/region labels could show generic fallback values such as `기타` and `전국` when more specific taxonomy links also existed.
- Rejected posters had no visible "request review again" action in the operator list.

## Fix

- Admin review now loads `poster_links` for each listed/focused poster and resolves the official source URL from `official_notice`, primary link, `official_homepage`, then `source_key`.
- Approval checklist and preview "원문 열기" use the resolved official source URL.
- Approval block toast now includes the blocking checklist label and detail.
- Operator create stores official links as `official_notice`.
- Operator create shows an inline missing-image error next to the submit button and explicitly sets high-contrast button text.
- Category/region display now prefers non-`기타` categories and more specific regions (`sigungu` > `sido` > `nation`) instead of relying on link row order.
- Operator list now exposes review request for both `draft` and `rejected` posters.
- Daily Crawler workflow Node.js version was raised from 20 to 24 because recent quality-gate failures were caused by Supabase Realtime requiring native WebSocket support.

## Verified

- DB check: `[QA 테스트] 검수 플로우 확인 공고` is `rejected`, has `source_key: null`, and has `poster_links.official_notice` with `https://www.mapo.go.kr/site/mapo/boardList.do?boardId=notice&seq=987654`.
- DB check: 2026-08-24 has two created poster rows, but neither is published, so the public home "오늘 새 공고 0건" can be explained by the published-only metric.
- DB check: 2026-08-24 crawler runs exist around 11:35-11:43 KST with failures 0 in recent source runs, but `new_count` is 0.
- GitHub Actions check: recent Daily Crawler failures were from the quality gate using Node 20 and failing with `Node.js 20 detected without native WebSocket support`.
- `pnpm --filter web exec tsc --noEmit --pretty false` passed.
- `pnpm --filter web lint` passed.
- `pnpm test` passed.
- `pnpm --filter posterlink-crawler test` passed.
- `pnpm --filter web build` passed.

## Still open

- The QA test poster was intentionally left in `rejected` status and not deleted.
- The D-1 favorite deadline notification should be checked after the next `check-deadlines` execution.
