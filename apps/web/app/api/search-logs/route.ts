import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
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

  const query = typeof payload.query === "string" ? payload.query.trim().slice(0, 120) : "";
  if (!query) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const resultCount = Number.isFinite(payload.result_count)
    ? Math.max(0, Math.min(Math.trunc(payload.result_count ?? 0), 100000))
    : 0;

  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.from("search_logs").insert({
    user_id: null,
    query,
    result_count: resultCount,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
