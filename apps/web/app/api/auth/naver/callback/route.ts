import { NextResponse } from "next/server";
import { NAVER_UNAVAILABLE_MESSAGE } from "../../../../../lib/naverAvailability";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Do not exchange a code, look up an email, mutate credentials or issue sessions.
// This also stops callbacks from authorization flows started before suspension.
export async function GET() {
  return NextResponse.json(
    { error: NAVER_UNAVAILABLE_MESSAGE, code: "naver_temporarily_unavailable" },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
