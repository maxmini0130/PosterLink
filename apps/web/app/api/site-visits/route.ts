import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase-server";

type SiteVisitPayload = {
  visitor_key?: string | null;
  session_key?: string | null;
  path?: string | null;
  query_string?: string | null;
  referrer_url?: string | null;
  user_agent?: string | null;
};

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function truncate(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function sanitizePath(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed.slice(0, 512);
}

function getReferrerHost(referrerUrl: string | null) {
  if (!referrerUrl) return null;
  try {
    return new URL(referrerUrl).hostname.replace(/^www\./, "").slice(0, 255);
  } catch {
    return null;
  }
}

function getSearchParams(queryString: string | null) {
  if (!queryString) return new URLSearchParams();
  return new URLSearchParams(queryString.startsWith("?") ? queryString.slice(1) : queryString);
}

function isIgnoredPath(path: string) {
  return (
    path.startsWith("/admin") ||
    path.startsWith("/api") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml"
  );
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("site_visit_logs");
}

export async function POST(request: Request) {
  let payload: SiteVisitPayload;

  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const visitorKey = truncate(payload.visitor_key, 120);
  const sessionKey = truncate(payload.session_key, 120);
  const path = sanitizePath(payload.path);

  if (!visitorKey || !path) {
    return NextResponse.json({ error: "Invalid visit payload" }, { status: 400 });
  }

  if (isIgnoredPath(path)) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const queryString = truncate(payload.query_string, 1024);
  const referrerUrl = truncate(payload.referrer_url, 2048);
  const referrerHost = getReferrerHost(referrerUrl);
  const searchParams = getSearchParams(queryString);

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { error } = await supabaseAdmin.from("site_visit_logs").insert({
    user_id: userId,
    visitor_key: visitorKey,
    session_key: sessionKey,
    path,
    query_string: queryString,
    referrer_url: referrerUrl,
    referrer_host: referrerHost,
    utm_source: truncate(searchParams.get("utm_source"), 120),
    utm_medium: truncate(searchParams.get("utm_medium"), 120),
    utm_campaign: truncate(searchParams.get("utm_campaign"), 200),
    user_agent: truncate(payload.user_agent, 512),
  });

  if (isMissingTableError(error)) {
    return NextResponse.json({ success: false, configured: false });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
