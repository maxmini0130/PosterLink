import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POSTER_VIEW_SOURCES, type PosterViewSource } from "../../../lib/productEventsCore";

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
    source?: string | null;
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
  const source = POSTER_VIEW_SOURCES.has(payload.source as PosterViewSource)
    ? payload.source
    : null;
  const record = {
    poster_id: payload.poster_id,
    visitor_key: visitorKey,
    referrer_path: payload.referrer_path ?? null,
  };
  const supabaseAdmin = createSupabaseAdmin();
  let { error } = await supabaseAdmin.from("poster_view_logs").insert({ ...record, source });
  // Until the source column migration is applied, keep logging the view itself.
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ error } = await supabaseAdmin.from("poster_view_logs").insert(record));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
