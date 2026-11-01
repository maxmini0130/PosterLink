import type { NextRequest } from "next/server";
import { attachAnalyticsAuthReceipt } from "../../../../lib/analyticsAuthReceipt";
import { safeReturnTo } from "../../../../lib/guestStore";
import {
  NAVER_NEXT_COOKIE,
  NAVER_TX_COOKIE,
  naverEnabled,
  naverIdHashes,
  parseHashKeys,
  parseTxCookie,
  sha256Hex,
} from "../../../../lib/naverAuthCore";
import { getAppOrigin } from "../../../../lib/siteUrl";
import {
  naverDb,
  sessionTokenFor,
} from "../../../../lib/server/naverAuthAdmin";
import { naverIdForCode } from "../../../../lib/server/naverProvider";
import {
  clearNaverCookies,
  redirectTo,
  sessionClient,
  unavailable,
} from "../shared";

export const dynamic = "force-dynamic";

/** Naver returns here. Sign-in finishes here; linking goes on to a confirmation. */
export async function GET(request: NextRequest) {
  if (!naverEnabled(process.env)) return unavailable();
  const origin = getAppOrigin();
  const params = request.nextUrl.searchParams;
  const tx = parseTxCookie(request.cookies.get(NAVER_TX_COOKIE)?.value);
  const code = params.get("code");
  const state = params.get("state");
  const failed = async (path = "/login?error=naver_failed") => {
    if (tx) await naverDb.fail(tx.id, sha256Hex(tx.secret));
    return clearNaverCookies(redirectTo(`${origin}${path}`));
  };
  if (!tx || !code || !state || params.has("error")) return failed();

  let keys: ReturnType<typeof parseHashKeys>;
  try {
    keys = parseHashKeys(process.env);
  } catch {
    return failed();
  }
  // Naver is asked only for a live transaction of this browser (at most 3 times).
  const secretHash = sha256Hex(tx.secret);
  if (!(await naverDb.beginCallback(tx.id, secretHash, sha256Hex(state))))
    return failed();
  const naverId = await naverIdForCode({
    clientId: process.env.NAVER_CLIENT_ID ?? "",
    clientSecret: process.env.NAVER_CLIENT_SECRET ?? "",
    code,
    state,
  });
  if (!naverId || keys.length === 0) return failed();

  const row = await naverDb.callback(
    tx.id,
    secretHash,
    sha256Hex(state),
    naverIdHashes(naverId, keys),
  );
  if (!row) return failed();

  if (row.purpose === "link_session")
    return redirectTo(`${origin}/auth/naver/link`);

  if (!row.target_user_id) return failed("/login?error=naver_not_linked");
  // Consume the transaction first, then issue the session for exactly that account.
  if (!(await naverDb.completeLogin(tx.id, secretHash, row.target_user_id)))
    return failed();
  const token = await sessionTokenFor(row.target_user_id);
  if (!token) return failed();

  // Verified on this request's cookie client; the session is kept only if it
  // belongs to the linked account.
  const { client, applyTo } = sessionClient(request);
  const { data, error } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: token,
  });
  if (
    error ||
    data.user?.id !== row.target_user_id ||
    data.session?.user?.id !== row.target_user_id
  ) {
    if (data?.session)
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    console.error("naver session user mismatch or verify failure");
    return failed();
  }
  // Unlinked between completing and issuing: the new session is not kept.
  if (!(await naverDb.stillLinked(tx.id, secretHash, row.target_user_id))) {
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return failed();
  }
  const next =
    safeReturnTo(request.cookies.get(NAVER_NEXT_COOKIE)?.value) ?? "/";
  const response = clearNaverCookies(applyTo(redirectTo(`${origin}${next}`)));
  attachAnalyticsAuthReceipt(request, response, "naver");
  return response;
}
