import type { NextRequest } from "next/server";
import { safeReturnTo } from "../../../../lib/guestStore";
import {
  NAVER_NEXT_COOKIE,
  NAVER_TX_COOKIE,
  NAVER_TX_TTL_SECONDS,
  encodeTxCookie,
  isRecentSignIn,
  naverEnabled,
  newSecret,
  parseHashKeys,
  sameOrigin,
  sha256Hex,
} from "../../../../lib/naverAuthCore";
import { getAppOrigin } from "../../../../lib/siteUrl";
import { naverDb } from "../../../../lib/server/naverAuthAdmin";
import { naverAuthorizeUrl } from "../../../../lib/server/naverProvider";
import {
  currentMember,
  redirectTo,
  setNaverCookie,
  unavailable,
} from "../shared";

export const dynamic = "force-dynamic";

/**
 * Starts Naver sign-in (purpose=login) or linking for the signed-in member
 * (purpose=link_session): a transaction bound to this browser, then Naver.
 */
export async function POST(request: NextRequest) {
  if (!naverEnabled(process.env)) return unavailable();
  const origin = getAppOrigin();
  if (!sameOrigin(request.headers, origin))
    return redirectTo(`${origin}/login?error=login_failed`);
  const clientId = process.env.NAVER_CLIENT_ID;
  let keys: ReturnType<typeof parseHashKeys>;
  try {
    keys = parseHashKeys(process.env);
  } catch {
    return unavailable();
  }
  if (!clientId || !process.env.NAVER_CLIENT_SECRET || keys.length === 0)
    return unavailable();

  const form = await request.formData().catch(() => null);
  const purpose =
    form?.get("purpose") === "link_session" ? "link_session" : "login";
  const fallback = purpose === "link_session" ? "/mypage/edit" : "/";
  const next = safeReturnTo(form?.get("next")) ?? fallback;

  let sessionUserId: string | null = null;
  if (purpose === "link_session") {
    const member = await currentMember(request);
    if (!member) return redirectTo(`${origin}/login`);
    // Linking a sign-in method needs a fresh sign-in to PosterLink.
    if (!isRecentSignIn(member.signedInAt, Date.now()))
      return redirectTo(`${origin}/mypage/edit?naver=reauth`);
    sessionUserId = member.id;
  }

  const secret = newSecret();
  const state = newSecret();
  const id = await naverDb.start(
    purpose,
    sha256Hex(secret),
    sha256Hex(state),
    sessionUserId,
  );
  if (!id)
    return redirectTo(
      `${origin}${purpose === "login" ? "/login?error=naver_failed" : "/mypage/edit?naver=link_failed"}`,
    );

  const response = redirectTo(
    naverAuthorizeUrl(clientId, `${origin}/auth/naver/callback`, state),
  );
  setNaverCookie(
    response,
    NAVER_TX_COOKIE,
    encodeTxCookie(id, secret),
    NAVER_TX_TTL_SECONDS,
  );
  setNaverCookie(response, NAVER_NEXT_COOKIE, next, NAVER_TX_TTL_SECONDS);
  return response;
}
