# GA4 on the deployed Naver-safe release

## Scope

- Base: deployed `2faf121ba5ded94eb8fabe12f297d21014a19c30`; branch `release/ga4-on-naver-safe-20261025`.
- Reused the previously received/withdrawal-verified GA4 engine from `bb066ee` (same validated transport lineage as `84bb5b5`). No replacement analytics system, age engine/RLS, DB change, deletion engine, Pixel/CAPI or advertisement configuration.
- Applied existing success-only action hooks, non-authorizing consent-gated OAuth receipt, existing visit/referrer sanitizers and Vercel analytics wrapper. Naver start/callback/message are byte-identical to deployed stop code. Generic callback checks the legacy Naver guard before analytics receipt/auth operations. Sentry, withdrawal, administrator statistics/security, middleware and migrations remain unchanged.
- Privacy draft reuses the existing full text, correcting the suspended Naver flow, email/manual withdrawal, approved 3-month/30-day/90-day policies, current lack of automatic deletion and optional GA4 notice. No 36-field survey or vendor re-enquiry. No guessed countries, legal basis or deletion periods. Effective date remains pending actual publication.

## IDs, consent and bounded verification

- This task's official Google Analytics home visibly shows Production **`G-1Z7X91CJCS`**. This agrees with the user's request and previous original-stream evidence; the older transposed `G-17ZX91CJCS` is not used.
- Official test stream details visibly show **`G-K8EVG5FHHF`**, PosterLink Preview Web, under PosterLink Preview QA 20261023 (property 560459356). Enhanced measurement OFF confirmed read-only. No Google account setting changed.
- Production defaults in source remain empty measurement ID and all enable/policy/non-production/debug flags false. Production environment is untouched. Only the protected, deployment-specific internal Preview may use the test ID with enable/policy/non-production/debug true under the already approved public-page internal test notice and consent; this does not approve the public policy.
- Existing voluntary choice/withdrawal UI is reused. Refusal permits normal service. No Google SDK before consent; loaded SDK's deferred dispatch is rechecked after withdrawal. Advertising/Google Signals remain disabled.
- Tests and live reception results are appended after verification. Network HTTP 204 alone is not a DebugView PASS.

## Mandatory remaining conditions, without wider investigation

- Confirm actual Google account contract/DPA recipient/contact, applicable transfer countries, record-specific retention/deletion conditions beyond the approved 14-month user/event setting, and the adopted Korean-law transfer ground/notice or consent requirements. The existing draft explicitly marks these unknown; optional analytics consent and DPA/SCC alone are not asserted sufficient.
- Existing service-provider mandatory unknowns remain in the existing approval record; this task does not silently turn those placeholders into completed legal notices or reopen a vendor-wide survey.
- Publish the approved notice with an actual effective date, then separately approve Production build and enablement. Planned Production values: `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-1Z7X91CJCS`, `NEXT_PUBLIC_GA_ENABLED=true`, `NEXT_PUBLIC_GA_POLICY_REVIEWED=true`, `NEXT_PUBLIC_GA_ALLOW_NON_PRODUCTION=false`, `NEXT_PUBLIC_GA_DEBUG=false`. Do not set them before approval. Account settings already approved: 14 months, four optional sharing options OFF, advertising personalization OFF; enhanced measurement must stay OFF to avoid automatic duplicate views.
- Attribution limitations are preserved: only consenting browsers are measured; no account/UTM linkage is stored; GA4 is not the Auth signup ledger. Existing OAuth receipts emit login and do not infer new signup from every login. Email signup requires an actual session/identity. Do not claim complete OAuth signup attribution or CPA from these partial events. This limitation is documented rather than adding an unapproved signup engine.
- Safe recovery remains Naver-stopped: disable GA collection using the same reviewed release and rebuild, retaining Naver stop, withdrawal and Sentry. Never roll back to vulnerable Naver code.

Primary references reused/checked: [Google retention](https://support.google.com/analytics/answer/7667196?hl=ko), [Korean standard GA terms](https://marketingplatform.google.com/about/analytics/terms/kr/), [Korean PIPA Article 28-8](https://www.law.go.kr/법령/개인정보보호법/제28조의8). The 14-month setting concerns user/event-level data, not every cookie or aggregate report.

No Production deploy, Production GA activation, operational policy publication, DB/RLS change, Git push or advertisement action is authorized by this task.
