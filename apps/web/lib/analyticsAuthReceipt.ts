import type { NextRequest, NextResponse } from "next/server";
/** Non-authorizing, short-lived success receipt; never contains an account/session identifier. */
export function attachAnalyticsAuthReceipt(
  request: NextRequest,
  response: NextResponse,
  method: string,
  signup = false,
) {
  if (request.cookies.get("pl_analytics_consent")?.value !== "granted") return;
  if (!["kakao", "google", "naver", "email"].includes(method)) return;
  response.cookies.set(
    "pl_analytics_auth",
    encodeURIComponent(JSON.stringify({ method, signup, at: Date.now() })),
    {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 300,
    },
  );
}
