import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { NAVER_UNAVAILABLE_MESSAGE } from "../../../lib/naverAvailability";
import {
  NAVER_COOKIE_PATH,
  NAVER_NEXT_COOKIE,
  NAVER_TX_COOKIE,
  lastSignInAt,
} from "../../../lib/naverAuthCore";

export const NO_STORE = { "Cache-Control": "private, no-store" };

/** What every Naver route answers while NAVER_LOGIN_ENABLED is off. */
export function unavailable() {
  return NextResponse.json(
    { error: NAVER_UNAVAILABLE_MESSAGE, code: "naver_temporarily_unavailable" },
    { status: 503, headers: NO_STORE },
  );
}

/** 303 so a POST is followed by a GET; never cached, no referrer. */
export function redirectTo(url: string) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function clearNaverCookies(response: NextResponse) {
  for (const name of [NAVER_TX_COOKIE, NAVER_NEXT_COOKIE])
    response.cookies.set(name, "", { path: NAVER_COOKIE_PATH, maxAge: 0 });
  return response;
}

export function setNaverCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number,
) {
  response.cookies.set(name, value, {
    path: NAVER_COOKIE_PATH,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
  });
}

/**
 * A Supabase client on this request's cookies. Session cookies it sets are
 * collected and copied onto the response with `applyTo`.
 */
export function sessionClient(request: NextRequest) {
  const pending = new Map<
    string,
    { value: string; options: Record<string, unknown> }
  >();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() {
          const merged = new Map(
            request.cookies.getAll().map((c) => [c.name, c.value]),
          );
          pending.forEach(({ value }, name) => merged.set(name, value));
          return [...merged].map(([name, value]) => ({ name, value }));
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) =>
            pending.set(name, { value, options }),
          );
        },
      },
    },
  );
  return {
    client,
    applyTo(response: NextResponse) {
      pending.forEach(({ value, options }, name) =>
        response.cookies.set(name, value, options),
      );
      return response;
    },
  };
}

/** The signed-in member (verified with Supabase) and when they last signed in. */
export async function currentMember(request: NextRequest) {
  const { client } = sessionClient(request);
  const { data: userData, error } = await client.auth.getUser();
  if (error || !userData.user) return null;
  const { data: claimsData } = await client.auth.getClaims();
  if (claimsData?.claims?.sub !== userData.user.id) return null;
  return { id: userData.user.id, signedInAt: lastSignInAt(claimsData.claims) };
}
