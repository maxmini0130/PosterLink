import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function repairUtf8Mojibake(value: string) {
  if (/[\uac00-\ud7a3]/.test(value)) return value;
  if (!/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßà-ÿ\u0080-\u009f]/.test(value)) return value;

  try {
    const bytes = Uint8Array.from(Array.from(value), (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /[\uac00-\ud7a3]/.test(decoded) ? decoded : value;
  } catch {
    return value;
  }
}

async function getRequestUserIdAndRole(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) return { userId: null, role: null };

  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  const userId = userData.user?.id ?? null;
  if (!userId) return { userId: null, role: null };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return {
    userId,
    role: typeof profile?.role === "string" ? profile.role : null,
  };
}

export async function POST(request: Request) {
  let payload: {
    query?: string;
    result_count?: number;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof payload.query === "string" ? repairUtf8Mojibake(payload.query).trim().slice(0, 120) : "";
  if (!query) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const resultCount = Number.isFinite(payload.result_count)
    ? Math.max(0, Math.min(Math.trunc(payload.result_count ?? 0), 100000))
    : 0;

  const supabaseAdmin = createSupabaseAdmin();
  const actor = await getRequestUserIdAndRole(supabaseAdmin, request);
  if (["admin", "super_admin", "operator"].includes(actor.role ?? "")) {
    return NextResponse.json({ success: true, skipped: "internal_actor" });
  }

  const { error } = await supabaseAdmin.from("search_logs").insert({
    user_id: actor.userId,
    query,
    result_count: resultCount,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
