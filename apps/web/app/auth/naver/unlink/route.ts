import type { NextRequest } from "next/server";
import {
  isRecentSignIn,
  naverEnabled,
  sameOrigin,
} from "../../../../lib/naverAuthCore";
import { getAppOrigin } from "../../../../lib/siteUrl";
import { naverDb } from "../../../../lib/server/naverAuthAdmin";
import { currentMember, redirectTo, unavailable } from "../shared";

export const dynamic = "force-dynamic";

/** Removes the member's Naver link, only while another sign-in method remains. */
export async function POST(request: NextRequest) {
  if (!naverEnabled(process.env)) return unavailable();
  const origin = getAppOrigin();
  const done = (result: string) =>
    redirectTo(`${origin}/mypage/edit?naver=${result}`);
  if (!sameOrigin(request.headers, origin)) return done("unlink_failed");
  const member = await currentMember(request);
  if (!member) return redirectTo(`${origin}/login`);
  if (!isRecentSignIn(member.signedInAt, Date.now())) return done("reauth");
  return done((await naverDb.unlink(member.id)) ? "unlinked" : "unlink_failed");
}
