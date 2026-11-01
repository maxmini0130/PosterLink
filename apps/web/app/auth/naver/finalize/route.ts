import type { NextRequest } from "next/server";
import {
  NAVER_TX_COOKIE,
  isRecentSignIn,
  naverEnabled,
  parseTxCookie,
  sameOrigin,
  sha256Hex,
} from "../../../../lib/naverAuthCore";
import { getAppOrigin } from "../../../../lib/siteUrl";
import { naverDb } from "../../../../lib/server/naverAuthAdmin";
import {
  clearNaverCookies,
  currentMember,
  redirectTo,
  unavailable,
} from "../shared";

export const dynamic = "force-dynamic";

/**
 * The member confirmed linking this Naver account. The database re-checks the
 * transaction, the member and the account row (under a lock) before linking.
 */
export async function POST(request: NextRequest) {
  if (!naverEnabled(process.env)) return unavailable();
  const origin = getAppOrigin();
  const done = (result: string) =>
    clearNaverCookies(redirectTo(`${origin}/mypage/edit?naver=${result}`));
  if (!sameOrigin(request.headers, origin)) return done("link_failed");
  const tx = parseTxCookie(request.cookies.get(NAVER_TX_COOKIE)?.value);
  if (!tx) return done("link_failed");
  const secretHash = sha256Hex(tx.secret);
  const member = await currentMember(request);
  if (
    !member ||
    member.signedInAt === null ||
    !isRecentSignIn(member.signedInAt, Date.now())
  ) {
    await naverDb.fail(tx.id, secretHash);
    return done(member ? "reauth" : "link_failed");
  }
  const linked = await naverDb.completeLink(
    tx.id,
    secretHash,
    member.id,
    member.signedInAt,
  );
  return done(linked === member.id ? "linked" : "link_failed");
}
