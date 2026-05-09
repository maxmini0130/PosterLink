import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const naverAt = searchParams.get("naver_at");
  const naverRt = searchParams.get("naver_rt");
  const at = searchParams.get("access_token");
  const rt = searchParams.get("refresh_token");

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

  let userId: string | undefined;
  let userEmail: string | undefined;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      return redirect(
        `${origin}/login?error=auth_callback_failed&msg=${encodeURIComponent(error?.message ?? "no_user")}`
      );
    }
    userId = data.user.id;
    userEmail = data.user.email ?? undefined;
  } else if (naverAt && naverRt) {
    const { data, error } = await supabase.auth.setSession({
      access_token: naverAt,
      refresh_token: naverRt,
    });
    if (error || !data.user) {
      return redirect(
        `${origin}/login?error=set_session_failed&msg=${encodeURIComponent(error?.message ?? "no_user")}`
      );
    }
    userId = data.user.id;
    userEmail = data.user.email ?? undefined;
  } else if (at && rt) {
    const { data, error } = await supabase.auth.setSession({
      access_token: at,
      refresh_token: rt,
    });
    if (error || !data.user) {
      return redirect(
        `${origin}/login?error=set_session_failed&msg=${encodeURIComponent(error?.message ?? "no_user")}`
      );
    }
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
        role: "user",
      },
      { onConflict: "id" }
    );
    if (upsertError) {
      return redirect(
        `${origin}/login?error=auth_callback_failed&msg=${encodeURIComponent(upsertError.message)}`
      );
    }
    return redirect(`${origin}/onboarding`);
  }

  return redirect(`${origin}/`);
}
