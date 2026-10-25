# GA4 Production code rollout — 2026-10-25

## Authorization and scope

- User authorized moving the existing verified Preview GA4 implementation to Production, retaining page_view/view_poster, inspecting existing policy/consent, duplicate collection and PII, with no new advertising/remarketing or other feature changes.
- Root fetch/status: clean, `release/ga4-on-naver-safe-20261025` at `24da040`. Prepared isolated worktree/branch `release/ga4-production-20261025` rather than changing unrelated current work.
- Verified current `www.posterlink.kr` and `posterlink.kr` point to READY `dpl_6kjCA8LQqrPKLU7atNvCR3jX1qjL`, URL `poster-link-3n5tenmyn-maxmini0130s-projects.vercel.app`. Production GA environment variables are absent. Existing project runtime is Node24.x; project configuration is unchanged.
- Preview source `061c128` and verified test-property reception in `WORK_LOG_20261025_ga4_naver_safe.md` are reused. analytics.ts, analyticsPrivacy.ts, analyticsTransport.ts and analyticsAuthReceipt.ts remain byte-identical. No new tags, replacement event engine, ad integrations, database migration, authentication/withdrawal change or real member write.

## Policy finding and activation boundary

- Live Production privacy page has the existing published A text, not GA4 disclosure. Preview privacy page is an explicitly unapproved draft with no effective date and unresolved Google customer contract/DPA recipient/contact, transfer countries, record-specific retention/deletion and adopted transfer basis.
- Existing `docs/privacy_policy_ga4_b_draft.md` and Preview policy.ts explicitly record these as unresolved. User authorized deployment, so no repeated deployment permission is requested. Asked only for a separately finalized disclosure, if one exists; none was supplied at preparation time.
- Do not publish that draft as an effective policy or claim the unconfirmed fields are reviewed. Preserve Production A's original body verbatim and reuse only the existing AnalyticsConsentSettings component. That component is hidden while configuration/policy gates are false.
- Production **code deployment and collection activation are separate**. Prepare/deploy verified implementation with `NEXT_PUBLIC_GA_ENABLED=false`, `NEXT_PUBLIC_GA_POLICY_REVIEWED=false`, production measurement ID `G-1Z7X91CJCS`, non-production allowance false and debug false. No test-property ID or active collection in Production. This does not complete the requested activation; finalized disclosure remains necessary.
- Advertising consent categories remain denied, allow_google_signals/allow_ad_personalization_signals false, no new remarketing/audience/Google Ads action. The earlier account verification recorded enhanced measurement OFF, sharing4 OFF and advertising personalization OFF; no account settings changed in this rollout.

## Collection and privacy checks

- Single owned Google script, no parallel GTM install; send_page_view false; manual path deduplication; poster-view requires public detail marker. Enhanced measurement must remain OFF when collection is eventually activated: config send_page_view false alone does not disable independent history measurement.
- SDK only initializes with optional explicit analytics consent. Withdrawal blocks new/deferred fetch/beacon/XHR hits, clears analytics stores/cookies and synchronizes other tabs. Failed storage/SDK updates do not reopen sending.
- Strict event/parameter allowlists, public-path filter, fixed page title, safe referrer host and controlled campaign slugs remove email, phone, name, user_id, auth tokens and raw search/query/hash values from event payloads. GA cookie/online identifiers, device/network processing would still exist after legitimate activation; not described as anonymous or zero personal data.
- Existing Naver stop, deletion stop, Sentry privacy, signup statistics, middleware, migrations and mobile paths are unchanged against Production `2faf121`. Existing own visit/referrer and Vercel analytics sanitizers are the same reviewed analytics-related changes from Preview.

## Validation and deployment

- Source preservation assertions: Preview engine byte equality PASS; Production policy body equality after removing only consent component wiring PASS.
- Scoped unit/security/privacy checks31/31 PASS; lint PASS. Browser event-contract tests15/15 PASS; actual handler/action fixture tests7/7 PASS. Node20.20.2 production-mode build PASS, including type checking. All action responses are mocked; no real signup, login, favorite/follow, member modification or deletion.
- An initial run included the historical withdrawal-only release snapshot test:30/31 passed; its byte-frozen login comparison fails on the already-authorized Preview analytics imports/hooks. Did not weaken or modify that historical test. Used the existing GA integration release contract plus actual withdrawal-stop, Naver, Sentry and mocked-handler checks for this release's scope; they pass.
- Official references checked: [manual page views / enhanced measurement](https://developers.google.com/analytics/devguides/collection/ga4/views), [PII exclusion](https://support.google.com/analytics/answer/6366371?hl=en).
- Deployment and live postcheck results: pending.

## Recovery and remaining work

- Keep the published privacy text and disabled production collection until final disclosure exists. Never set POLICY_REVIEWED=true solely to bypass this finding.
- If release fails, return to the previously READY Naver-safe deployment above; never restore the vulnerable Naver flow. No DB rollback needed. To stop later collection, disable/rebuild the same reviewed code while retaining Naver, withdrawal and Sentry protections.
- Activation needs finalized disclosure/effective date and factual Google transfer information. Once available, reuse the existing engine with production-only flags and verify actual consent-before0 → page_view once per navigation → view_poster → withdrawal0, payload filtering and actual Google-side receipt. Do not equate collector204 or fixture events with live Production reception.
