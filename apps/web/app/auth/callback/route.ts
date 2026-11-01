import { attachAnalyticsAuthReceipt } from "../../../lib/analyticsAuthReceipt";
import { NAVER_UNAVAILABLE_MESSAGE } from "../../../lib/naverAvailability";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function safeNextPath(value: string | null, origin: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const parsed = new URL(value, origin);
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (searchParams.has("naver_at") || searchParams.has("naver_rt"))
    return NextResponse.json(
      { error: NAVER_UNAVAILABLE_MESSAGE, code: "naver_temporarily_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  // Sessions are never accepted from the URL: a link carrying someone else's
  // tokens would sign this browser into their account (login CSRF).
  if (searchParams.has("access_token") || searchParams.has("refresh_token")) {
    const res = NextResponse.redirect(`${origin}/login?error=login_failed`);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }
  const nextPath = safeNextPath(searchParams.get("next"), origin);

  const cookieStore = cookies();
  // pending: exchangeCodeForSession이 세팅한 쿠키를 이후 쿼리에서도 읽을 수 있도록 병합
  const pendingMap = new Map<string, { value: string; options: Record<string, unknown> }>();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() {
          const base = cookieStore.getAll();
          const merged = new Map(base.map((c) => [c.name, c.value]));
          pendingMap.forEach(({ value }, name) => merged.set(name, value));
          return Array.from(merged.entries()).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            pendingMap.set(name, { value, options })
          );
        },
      },
    }
  );

  function redirect(url: string) {
    const res = NextResponse.redirect(url);
    pendingMap.forEach(({ value, options }, name) =>
      res.cookies.set(name, value, options)
    );
    return res;
  }

  let analyticsMethod = "";
  let userId: string | undefined;
  let userEmail: string | undefined;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      return redirect(`${origin}/login?error=auth_callback_failed`);
    }
    analyticsMethod = data.user.app_metadata?.provider || "email";
    userId = data.user.id;
    userEmail = data.user.email ?? undefined;
  } else {
    return redirect(`${origin}/login?error=login_failed`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_region_id")
    .eq("id", userId!)
    .single();

  if (!profile || !profile.primary_region_id) {
    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: userId!,
        nickname: userEmail?.split("@")[0] ?? "user",
      },
      { onConflict: "id" }
    );
    if (upsertError) {
      return redirect(`${origin}/login?error=auth_callback_failed`);
    }
    const response = redirect(`${origin}/onboarding?next=${encodeURIComponent(nextPath)}`);
    attachAnalyticsAuthReceipt(request, response, analyticsMethod);
    return response;
  }

  const response = redirect(`${origin}${nextPath}`);
  attachAnalyticsAuthReceipt(request, response, analyticsMethod);
  return response;
}
