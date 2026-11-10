# GA4 policy fact check — 2026-10-25

## Scope and authorization

User confirmed no final GA4 privacy policy exists and requested the existing B draft be revised against the current public policy, official Google terms/DPA/transfer material and actual account settings, followed by implementation verification. Final policy approval/publication and deployment approval are separate. No publication, production activation, Google privacy setting change or operational database write in this task.

Started with `git fetch origin` and clean `git status --short --branch` on `release/ga4-on-naver-safe-20261025` at24da040. Read CLAUDE, README, B draft, implementation/tests and latest integration/production rollout logs. Preserved existing user code. No agents used.

## Findings and changes

- Updated `docs/privacy_policy_ga4_b_draft.md`: explicitly unpublished, compares against deployed A rather than local Preview draft, links evidence report, clarifies actual collection items/IP/city/device processing, browser storage, retention reset and conditional DPA deletion. No invented countries, final legal basis or effective date.
- Added `docs/ga4_policy_fact_check_20261025.md`: current A/B comparison, dated Google primary sources, actual account observations, transfer/retention/deletion distinctions, implementation/test evidence and remaining activation conditions.
- Actual read-only UI: operating property560078853, stream16182912963, G-1Z7X91CJCS. Sharing4OFF, enhanced measurementOFF, user/event14months, **reset on new activityON**. DPA accepted2022-09-14 but legal-entity/contact details unpopulated; account business-countryUSA is not transfer-country evidence. Do not commit account holder/contact personal details.
- Important correction to earlier evidence: operating property's advertising personalization is **allowed in307/307regions**, not OFF. Google signals/user-provided-data not enabled; Google Ads links0, connected site tags0. Code blocks ad consent/signals, but that does not establish account-wideOFF. No toggles, Save, Apply, Accept or Link actions used; opening panels is read-only.
- Granular device/location collectionON; policy cannot promise no location/device processing. Google official non-EU IP processing explanation checked, not replaced with EU-only IP assumptions.
- Cookie override panel did not expose a reliable final expiration/update value; preserved as a concrete verification gap. Did not enter edit mode or change settings. Public default2years is not claimed as actual effective lifetime.
- Local/Preview `apps/web/app/privacy/policy.ts` remains an unapproved draft and includes an old accountOFF assertion. It is not the deployed A. Final approval must align that draft/rendered route with the revised B before publication; this docs-only task does not silently publish it.

## Validation

- GA engine4files byte-identical against production source0aa3524 (`git diff` empty).
- Scoped security/privacy/Auth statistics tests31/31PASS; browser event contracts15/15PASS; mocked actual handler/consent UI tests7/7PASS. Commands in fact-check report. No real account or membership writes and no new live Google collection.
- Fresh live Production Chromium: pre-consent Google requests0; synthetic stored consent/reload/public detail requests0; GA script0; page errors0; original public privacy body hash unchanged. Ten unrelated non-read requests blocked before sending. Local ignored artifact `data/results/ga4-production-live-20261025.json`, timestamp2026-10-25T10:08:54Z.
- Fixture payload/PII tests are bounded; previous test-property DebugView is not represented as current Production reception. Code/runtime remains unchanged; no fresh lint/build/full-crawler/mobile run for docs-only changes. Existing deployment build/lint evidence remains in the separate production worktree log.
- UTF-8, local links, Prettier and `git diff --check` checked before commit.

## Outcome and remaining gates

Production code is already deployed with ENABLED=false/POLICY_REVIEWED=false; this task did not deploy. Collection activation is not ready. Need contract/customer/recipient/contact and applicable transfer country evidence, record-specific retention/deletion scope and actual cookie settings, resolution of advertising-account mismatch, adopted legal transfer ground with suitable disclosure/consent/version/time evidence and reconsent handling, then separate final policy/publication approval and actual publication before separately authorized activation/deployment and real receipt verification. No environments, DB/RLS, migrations, ads/remarketing or other features changed. No rollback required for documentation; leave current collectionOFF.
