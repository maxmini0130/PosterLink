import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: Request) {
  let payload: {
    poster_id?: string;
    visitor_key?: string | null;
    referrer_path?: string | null;
  };

  try {
    const rawBody = await request.text();
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.poster_id || !uuidPattern.test(payload.poster_id)) {
    return NextResponse.json({ error: "Invalid poster_id" }, { status: 400 });
  }

  const visitorKey = typeof payload.visitor_key === "string"
    ? payload.visitor_key.slice(0, 120)
    : null;
  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.from("poster_view_logs").insert({
    poster_id: payload.poster_id,
    visitor_key: visitorKey,
    referrer_path: payload.referrer_path ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
