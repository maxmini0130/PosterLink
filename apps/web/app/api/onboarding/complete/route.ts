import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const cookieStore = cookies();

  // 인증된 사용자 확인 (anon key + 세션)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { nickname, regionId, ageBand, gender, categoryIds } = body;

  if (!regionId || !ageBand || !gender) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // service_role로 RLS 우회하여 안전하게 저장
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 기존 role을 유지하기 위해 현재 값을 먼저 조회
  const { data: existing } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const currentRole = existing?.role ?? "user";

  const profileData: Record<string, unknown> = {
    id: user.id,
    primary_region_id: regionId,
    age_band: ageBand,
    gender: gender || "prefer_not_to_say",
    role: currentRole,
    onboarding_completed: true,
  };
  if (nickname && nickname.trim().length >= 2) {
    profileData.nickname = nickname.trim();
  }

  const { error: profileError } = await admin.from("profiles").upsert(profileData, { onConflict: "id" });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (categoryIds && categoryIds.length > 0) {
    await admin.from("user_interest_categories").delete().eq("user_id", user.id);
    const uniqueIds: string[] = [...new Set<string>(categoryIds)];
    const inserts = uniqueIds.map((catId: string) => ({ user_id: user.id, category_id: catId }));
    const { error: catError } = await admin.from("user_interest_categories").insert(inserts);
    if (catError) {
      return NextResponse.json({ error: catError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
