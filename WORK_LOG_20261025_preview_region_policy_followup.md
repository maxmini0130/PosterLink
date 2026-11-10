# Preview and region policy follow-up — 2026-10-25

Fetched origin/status clean on `fix/public-ac-web-20261025`. User closed cache investigation as “미재현, 관측 측 캐시로 추정”, requested a manual smoke script without execution, a608fbc8Preview for review before Production approval, and new B policy/Mapo/case/missing-institution reports plus B release-gate recheck.

## A/C

- Added `scripts/security/production-poster-date-smoke.mjs`, manual-only/unimported/unscheduled. It compares actual KST today with date+D labels in Production SSR articles; no pairs, errors or midnight crossing are inconclusive. **Did not execute it** or attach it to tests/build.
- Preserved608fbc8 in the detached A/C worktree; new source changes in this follow-up are smoke/docs only.
- Created review Preview `https://poster-link-jdhecesgg-maxmini0130s-projects.vercel.app`, READY `dpl_6B9qPgsottfRT5nCTedSdkABr9XP`, source metadata608fbc8. Deployment-only Supabase URL/key overrides route browser and server requests through a separate read-only Vercel proxy. Project-wide Preview/Production environment bindings were not changed. All GA/policy enable flags remainfalse.
- Separate helper project `posterlink-readonly-data-20261025` serves a read-only public-data proxy; Vercel assigned its first deployment the helper project's Production alias. This is a new review helper, **not** PosterLink Production. Proxy forwards only public anonymous SELECTs and three existing read-only RPCs, discards caller credentials, rejects authentication/other tables/writes, and never uses a service-role key upstream. Public anonymous credential remains server-side in ignored local/deployment source, not committed or printed.
- Pure handler mutation checks PATCH/DELETE/PUT returned403 with upstream fetch count0. Preview authenticated GET `/posters` returned HTML with12articles/count293 and no app error. No real signup/favorite/notification/write operation was tested.
- Confirmed `www.posterlink.kr` still points to prior `dpl_K26HCSXnYc5ycQD86N5S1huG1a1g` / `poster-link-bru2ivdnl...`; PosterLink Production was not deployed, aliased or promoted. User's Production approval remains required. Helper/Preview deploy logs and raw Preview HTML are ignored under root data/results. No secrets committed.

## B (separate worktree/branch)

- Confidence0 preserves every legacy region value; only region_confidence0 metadata is prepared. 1118old proposed differences meant old region array vs empty candidate array, not executed deletion. All1127zero-score rows (including9already-empty) get the same preserve policy.
- Confidence.95 structured64 and.9 eligibility241 changed rows are pending user sample approval as bulk candidates. Confidence.7 two and.45 193changed rows remain individual review. No group approved automatically.
- Added policy and review-placement helpers/tests; optional schema-gated public query splits explicit zero-confidence rows from district main into “지역 미확인”. Missing/null confidence is not silently treated as0. Complete-set check prevents inaccurate split counts. Flag `POSTER_REGION_REVIEW_POLICY` remains unset; no schema/metadata applied.
- Read-only snapshot293open posters, Mapo legacy exact16. Policy projection: main12 (9original.45 candidates +3original.9 eligibility), unknown4. Existing region tags are not changed; higher-score proposals are not assumed approved. Report lists all16IDs.
- Local report includes same10unknown samples, all matching original four mis-tag patterns, and frequency-ranked top30institution-name candidates among195individual-review proposals. Name extraction excludes obvious program titles/geographic-only labels/person roles;69unmatched normalized name candidates,37unresolved rows. Candidates are not automatically added to master.
- SQL proposal isolated onto `prep/public-b-region-schema-20261025` at853339d; removed from active B branch so its existing “GA integration preserves ... byte-for-byte” gate passes without changing assertions. Schema proposal not executed. B policy/normalizer7tests and web placement/discovery2tests passed; build/lint/type validation recorded in B log.

No operating DB writes, migration apply, notification send, original-site Production deployment, git push or approval of B rows. A/C review URL is provided; B remains local and pending policy/schema approval.
