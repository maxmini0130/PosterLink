# Production Naver emergency stop

## Release boundary

- Branch: `release/naver-emergency-stop-20261025`, directly from Production `3c71e3a76e01c3b7966217e3e7c17f7433b0a716`.
- Reused exactly the validated `e0fdeb3` Naver start/callback stop handlers and shared message. Applied only the Naver token-bridge removal to the Production generic callback and only the Naver disabled button/message to Production login/signup.
- Runtime files: `apps/web/app/api/auth/naver/route.ts`, `apps/web/app/api/auth/naver/callback/route.ts`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`, `apps/web/lib/naverAvailability.ts`.
- Added `scripts/security/naver-emergency-stop.test.ts` and this log only. No minimum-age code/RLS migration, GA4, privacy-policy revision, SQL/Cron, dependency or environment-setting change.
- All Naver start/native/callback paths return private/no-store 503, including in-flight callbacks and the old `naver_at`/`naver_rt` generic callback bridge. No email lookup, password mutation/derivation, account creation, provider exchange, session issuance or Auth cookie is possible in these handlers. Existing sessions are not revoked or overwritten.
- Google/Kakao PKCE and the existing generic native session path remain unchanged. Sentry, withdrawal safety stop, administrator code, signup statistics, middleware, privacy policy, layout, SEO and migrations remain identical to Production; source comparison tests enforce the protected paths.

## Read-only Production findings — 2026-10-25 UTC

- `www.posterlink.kr` alias resolves to `dpl_E5C74mvuWLgXD7rkLzGKGCgPf25t`, URL `poster-link-16snqf7hg-maxmini0130s-projects.vercel.app`, SHA `3c71e3a76e01c3b7966217e3e7c17f7433b0a716`, Pro team. No Production deploy occurred.
- Public Production start endpoint still returns 307 to Naver authorization; callback without code/state returns `invalid_state`. Vulnerable source is still live until this separate release is approved and deployed. No valid OAuth code was submitted.
- Complete read-only Auth scan: 12 accounts, 4 with Naver provider metadata; 2 of those have the email/password provider marker, none have Google/Kakao native identities. These are investigation candidates, **not four confirmed password-change victims**. Candidate last-sign-in range: 2026-05-09 through 2026-08-16 UTC. No raw member email, ID, metadata, password or session token was output or saved.
- Requested the last seven days of the current deployment's available runtime logs. Naver search returns 4 entries, callback search 2 (overlapping, not additive). Read-only checks performed by this task are included. No explicit password-update evidence appears. Runtime logging is not a complete immutable Auth/password audit trail; the old handler does not reliably record those operations.
- Auth password-change history and current Auth session/refresh-token rows were not available through the permitted existing admin-list API. **Historical impact and residual session count remain unconfirmed**; current metadata and absent runtime evidence cannot prove no impact.
- Anonymous Naver-start checks on the current deployment origin and prior `eb5ddef` / `19db3c39` origins all return Vercel protection 302. This is access protection, not removal of their vulnerable code. Keep protection enabled; authenticated/bypass access remains a risk. Old deployments were not modified or deleted.

## Verification

- Pulled Production environment read-only into ignored local files, verified the operating Supabase host, no test-project/age settings or enabled GA flags. No values were printed or committed. Vercel sensitive secrets are omitted/empty in local pull; the existing local Production key was used solely for the read-only Auth inspection, without modifying Vercel settings. Full privileged runtime verification therefore is not claimed.
- Node 20.20.2 local build using the pulled Production configuration: PASS. Actual Vercel Production new build must occur only after approval, using Vercel's retained Production secrets; no Preview promotion or test environment overrides.
- TypeScript, Lint and diff check: PASS.
- New stop/Production source comparison, withdrawal and Sentry tests: **11/11 PASS**. Simulated Google/Kakao existing-member callbacks still issue their expected provider session; Naver direct/mobile/in-flight/mixed token entry invokes zero Auth clients, credential operations, session operations, profile writes or fetches. Actual-account OAuth re-login was not performed.
- Root `pnpm test`: **170/172 PASS**. Two historical `profile-role-release.test.ts` assertions hard-code the previous signup-statistics-only release shape. Both also fail on an isolated complete archive of unmodified Production `3c71e3a`; they were not weakened or deleted. The new emergency-release source comparisons pass.
- Local built-app HTTP: five Naver/legacy entry variants return 503, no redirect, no Set-Cookie; robots/sitemap return 200.
- Playwright PC Chromium, iPhone WebKit and Android Chromium: login/signup show disabled Naver and explanatory notice, no overflow or page exceptions. Every browser write request was intercepted before transmission; no real member login or data write. Screenshots retained only in ignored local artifacts. Local test server stopped.
- No Production DB/schema/RLS/password/role/session change, data deletion, Production deploy, GA activation or Git push.

## Approval and safe recovery

1. Approve only this Production-based emergency release. On approval, recheck the source, current alias and unchanged Production environment, then perform a fresh Production build on Vercel. Do not promote the isolated age/GA Preview.
2. Verify public Naver start/callback/native/legacy paths give 503 without Auth cookies, normal login UI, withdrawal safety, administrator/statistics authentication and SEO. A disabled button alone is insufficient.
3. Preserve the new stopped deployment as the recovery candidate. If unrelated functionality fails, rebuild the same safe SHA or make a forward fix preserving these stop handlers, Sentry filtering and withdrawal safety. Never automatically roll back to `3c71e3a`, `eb5ddef` or `19db3c39` with live Naver bridging. If no safe recovery is available, stop and report.
4. Existing issued sessions are not invalidated by deploying this patch. For affected accounts confirmed through a separate, authorized Auth audit, preserve evidence, verify ownership via the pre-existing legitimate login method, and propose targeted session/refresh-token invalidation and legitimate account recovery. Changing passwords or signing everyone out is not authorized. Do not revive derived passwords, fabricate emails, or automatically link by email.

Production deployment approval remains required. The operational vulnerability is not closed by this local preparation alone.
