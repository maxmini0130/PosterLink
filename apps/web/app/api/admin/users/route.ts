import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

async function requireSuperAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "super_admin" ? user : null;
}

// GET /api/admin/users?role=user|operator|admin
export async function GET(req: NextRequest) {
  const caller = await requireSuperAdmin();
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = req.nextUrl.searchParams.get("role") ?? "user";
  const sa = adminClient();

  const { data: profiles, error } = await sa
    .from("profiles")
    .select("id, nickname, avatar_url, role, created_at")
    .eq("role", role)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // auth.users에서 이메일 일괄 조회
  const ids = (profiles ?? []).map((p: any) => p.id);
  const emailMap: Record<string, string> = {};

  if (ids.length > 0) {
    // Supabase admin API는 페이지네이션으로만 전체 조회 가능
    let page = 1;
    while (true) {
      const { data: authData } = await sa.auth.admin.listUsers({ page, perPage: 1000 });
      if (!authData?.users?.length) break;
      for (const u of authData.users) {
        if (ids.includes(u.id)) emailMap[u.id] = u.email ?? "";
      }
      if (authData.users.length < 1000) break;
      page++;
    }
  }

  const users = (profiles ?? []).map((p: any) => ({
    ...p,
    email: emailMap[p.id] ?? "",
  }));

  return NextResponse.json({ users });
}
