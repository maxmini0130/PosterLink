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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const posterIds = (searchParams.get("posterIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => uuidPattern.test(id))
    .slice(0, 100);

  if (posterIds.length === 0) {
    return NextResponse.json({ clickCounts: {}, favoriteCounts: {}, counts: {} });
  }

  const supabaseAdmin = createSupabaseAdmin();
  const [clicksRes, favoritesRes] = await Promise.all([
    supabaseAdmin
      .from("poster_link_click_logs")
      .select("poster_id")
      .in("poster_id", posterIds),
    supabaseAdmin
      .from("favorites")
      .select("poster_id")
      .in("poster_id", posterIds),
  ]);

  if (clicksRes.error || favoritesRes.error) {
    return NextResponse.json(
      { error: clicksRes.error?.message ?? favoritesRes.error?.message },
      { status: 500 }
    );
  }

  const clickCounts = Object.fromEntries(posterIds.map((posterId) => [posterId, 0]));
  const favoriteCounts = Object.fromEntries(posterIds.map((posterId) => [posterId, 0]));

  for (const row of clicksRes.data ?? []) {
    const posterId = row.poster_id as string | null;
    if (posterId && posterId in clickCounts) {
      clickCounts[posterId] += 1;
    }
  }

  for (const row of favoritesRes.data ?? []) {
    const posterId = row.poster_id as string | null;
    if (posterId && posterId in favoriteCounts) {
      favoriteCounts[posterId] += 1;
    }
  }

  return NextResponse.json({ clickCounts, favoriteCounts, counts: clickCounts });
}

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
  const supabaseAdmin = createSupabaseAdmin();

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
