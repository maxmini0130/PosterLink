import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let payload: {
    poster_id?: string;
    link_id?: string | null;
    link_type?: string | null;
    link_url?: string;
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

  if (!payload.link_url || payload.link_url.length > 2048) {
    return NextResponse.json({ error: "Invalid link_url" }, { status: 400 });
  }

  const linkId = payload.link_id && uuidPattern.test(payload.link_id) ? payload.link_id : null;
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabaseAdmin.from("poster_link_click_logs").insert({
    poster_id: payload.poster_id,
    link_id: linkId,
    link_type: payload.link_type ?? null,
    link_url: payload.link_url,
    referrer_path: payload.referrer_path ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
