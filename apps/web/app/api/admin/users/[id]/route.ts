import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

const ALLOWED_ROLES = ["user", "operator", "admin", "super_admin"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

// PATCH /api/admin/users/[id]  body: { role: 'user' | 'operator' | 'admin' }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // super_admin 확인
  const supabase = await createSupabaseServerClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetId } = await params;
  const body = await req.json();
  const newRole = body.role as AllowedRole;

  if (!ALLOWED_ROLES.includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // 자기 자신의 역할은 변경 불가
  if (targetId === caller.id) {
    return NextResponse.json({ error: "Cannot change own role" }, { status: 400 });
  }

  const sa = adminClient();
  const { error } = await sa
    .from("profiles")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", targetId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, role: newRole });
}
