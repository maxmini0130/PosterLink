import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const CLIENT_EVENTS = new Set([
  "alert_cta_view",
  "alert_cta_click",
  "auth_modal_view",
  "login_complete",
  "alert_saved",
  "notification_open",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventName = cleanText(body.event_name, 64);
  const posterId = cleanText(body.poster_id, 36);
  const posterStatus = cleanText(body.poster_status, 32);
  const region = cleanText(body.region, 120);
  const category = cleanText(body.category, 120);
  const ctaVariant = cleanText(body.cta_variant, 64);
  const validVariant =
    ctaVariant === "closed_poster_v1" ||
    (eventName === "notification_open" &&
      ctaVariant === "favorite_deadline_v1");

  if (
    !CLIENT_EVENTS.has(eventName) ||
    !UUID_PATTERN.test(posterId) ||
    !["closed", "published"].includes(posterStatus) ||
    !region ||
    !category ||
    !validVariant
  ) {
    return NextResponse.json({ error: "Invalid alert event" }, { status: 400 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await supabaseAdmin.from("product_events").insert({
    event_name: eventName,
    poster_id: posterId,
    poster_status: posterStatus,
    region,
    category,
    cta_variant: ctaVariant,
  });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
