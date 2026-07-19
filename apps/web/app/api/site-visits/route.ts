import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase-server";

export const runtime = "nodejs";

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

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42703" || error.code === "PGRST204" || message.includes("ip_hash");
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const candidate =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedFor?.split(",")[0] ||
    null;

  return candidate?.trim().toLowerCase() || null;
}

function hashIp(ip: string | null) {
  if (!ip) return null;
  const salt =
    process.env.SITE_VISIT_IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "posterlink-site-visit";

  return crypto.createHmac("sha256", salt).update(ip).digest("hex");
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
  const visitRecord = {
    user_id: userId,
    ip_hash: hashIp(getClientIp(request)),
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
  };

  let { error } = await supabaseAdmin.from("site_visit_logs").insert(visitRecord);

  if (isMissingColumnError(error)) {
    const legacyVisitRecord: Omit<typeof visitRecord, "ip_hash"> = {
      user_id: visitRecord.user_id,
      visitor_key: visitRecord.visitor_key,
      session_key: visitRecord.session_key,
      path: visitRecord.path,
      query_string: visitRecord.query_string,
      referrer_url: visitRecord.referrer_url,
      referrer_host: visitRecord.referrer_host,
      utm_source: visitRecord.utm_source,
      utm_medium: visitRecord.utm_medium,
      utm_campaign: visitRecord.utm_campaign,
      user_agent: visitRecord.user_agent,
    };
    const retry = await supabaseAdmin.from("site_visit_logs").insert(legacyVisitRecord);
    error = retry.error;
  }

  if (isMissingTableError(error)) {
    return NextResponse.json({ success: false, configured: false });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
