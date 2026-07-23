import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const DEFAULT_DAYS = 30;
const MAX_ROWS = 10000;
const VISIT_SELECT_COLUMNS =
  "created_at, user_id, ip_hash, visitor_key, session_key, path, query_string, referrer_url, referrer_host, utm_source, utm_medium, utm_campaign, user_agent";
const LEGACY_VISIT_SELECT_COLUMNS =
  "created_at, user_id, visitor_key, session_key, path, query_string, referrer_url, referrer_host, utm_source, utm_medium, utm_campaign, user_agent";

type VisitRow = {
  created_at: string;
  user_id: string | null;
  ip_hash: string | null;
  visitor_key: string | null;
  session_key: string | null;
  path: string | null;
  query_string: string | null;
  referrer_url: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  user_agent: string | null;
};

type OverviewRow = {
  total_visitors: number;
  total_sessions: number;
  total_pageviews: number;
  period_visitors: number;
  period_sessions: number;
  period_pageviews: number;
  today_visitors: number;
  today_pageviews: number;
};

type ClientPlatform = {
  key: "app" | "mobile_web" | "tablet_web" | "desktop_web" | "bot" | "unknown";
  label: string;
};

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function assertAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return ADMIN_ROLES.has(profile?.role);
}

function clampDays(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
}

function normalizeHost(host: string | null) {
  return (host ?? "").toLowerCase().replace(/^www\./, "");
}

function getOwnHosts() {
  const hosts = new Set(["posterlink.kr", "posterlink.co.kr", "localhost", "127.0.0.1"]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`).hostname.replace(/^www\./, ""));
    } catch {
      // Ignore malformed environment values.
    }
  }
  return hosts;
}

function getSourceLabel(row: VisitRow, ownHosts: Set<string>) {
  const utmSource = row.utm_source?.trim();
  if (utmSource) return utmSource;

  const host = normalizeHost(row.referrer_host);
  if (!host || ownHosts.has(host)) return "직접 유입";
  if (host.includes("google.")) return "Google";
  if (host.includes("naver.")) return "Naver";
  if (host.includes("daum.net") || host.includes("kakao.")) return "Daum/Kakao";
  if (host.includes("instagram.")) return "Instagram";
  if (host.includes("facebook.") || host.includes("fb.")) return "Facebook";
  if (host.includes("threads.")) return "Threads";
  if (host.includes("x.com") || host.includes("twitter.")) return "X/Twitter";
  if (host.includes("youtube.")) return "YouTube";
  return host;
}

function getSessionId(row: VisitRow, index: number) {
  return row.session_key || getVisitorId(row, index);
}

function getVisitorId(row: VisitRow, index: number) {
  return row.user_id || row.ip_hash || row.visitor_key || `anonymous-${row.created_at}-${index}`;
}

function getPath(row: VisitRow) {
  return row.path || "/";
}

function getQueryParams(row: VisitRow) {
  const query = row.query_string;
  if (!query) return new URLSearchParams();
  return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
}

function getClientPlatform(row: VisitRow): ClientPlatform {
  const ua = (row.user_agent ?? "").toLowerCase();
  const query = getQueryParams(row);
  const utmSource = (row.utm_source ?? query.get("utm_source") ?? "").toLowerCase();
  const utmMedium = (row.utm_medium ?? query.get("utm_medium") ?? "").toLowerCase();
  const appParam = (query.get("app") ?? "").toLowerCase();

  if (
    ua.includes("posterlinkapp") ||
    utmSource === "posterlink_app" ||
    utmMedium === "app" ||
    appParam === "1" ||
    appParam === "true"
  ) {
    return { key: "app", label: "앱" };
  }

  if (/bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot/i.test(ua)) {
    return { key: "bot", label: "봇/크롤러" };
  }

  if (/ipad|tablet|kindle|silk|playbook/i.test(ua)) {
    return { key: "tablet_web", label: "태블릿 웹" };
  }

  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) {
    return { key: "mobile_web", label: "모바일 웹" };
  }

  if (ua) return { key: "desktop_web", label: "데스크톱 웹" };
  return { key: "unknown", label: "알 수 없음" };
}

function formatDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function isMissingAnalyticsError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    message.includes("site_visit_logs") ||
    message.includes("get_site_visit_overview") ||
    message.includes("get_site_visit_identity_overview")
  );
}

function isMissingIdentityColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42703" || error.code === "PGRST204" || message.includes("ip_hash");
}

function normalizeVisitRows(rows: Partial<VisitRow>[] | null | undefined): VisitRow[] {
  return (rows ?? []).map((row) => ({
    created_at: row.created_at ?? new Date(0).toISOString(),
    user_id: row.user_id ?? null,
    ip_hash: row.ip_hash ?? null,
    visitor_key: row.visitor_key ?? null,
    session_key: row.session_key ?? null,
    path: row.path ?? null,
    query_string: row.query_string ?? null,
    referrer_url: row.referrer_url ?? null,
    referrer_host: row.referrer_host ?? null,
    utm_source: row.utm_source ?? null,
    utm_medium: row.utm_medium ?? null,
    utm_campaign: row.utm_campaign ?? null,
    user_agent: row.user_agent ?? null,
  }));
}

function buildFallbackOverview(allRows: VisitRow[], periodRows: VisitRow[]) {
  const totalVisitors = new Set<string>();
  const totalSessions = new Set<string>();
  const periodVisitors = new Set<string>();
  const periodSessions = new Set<string>();
  const todayVisitors = new Set<string>();
  const todayKey = formatDateKey(new Date().toISOString());
  let todayPageviews = 0;

  allRows.forEach((row, index) => {
    totalVisitors.add(getVisitorId(row, index));
    totalSessions.add(getSessionId(row, index));
  });

  periodRows.forEach((row, index) => {
    periodVisitors.add(getVisitorId(row, index));
    periodSessions.add(getSessionId(row, index));
    if (formatDateKey(row.created_at) === todayKey) {
      todayVisitors.add(getVisitorId(row, index));
      todayPageviews += 1;
    }
  });

  return {
    total_visitors: totalVisitors.size,
    total_sessions: totalSessions.size,
    total_pageviews: allRows.length,
    period_visitors: periodVisitors.size,
    period_sessions: periodSessions.size,
    period_pageviews: periodRows.length,
    today_visitors: todayVisitors.size,
    today_pageviews: todayPageviews,
  };
}

function toCountList<T extends { visitors?: Set<string>; sessions?: Set<string> }>(
  entries: Array<[string, T & { pageviews?: number }]>,
  mapValue: (key: string, value: T & { pageviews?: number }) => Record<string, unknown>
) {
  return entries
    .map(([key, value]) => mapValue(key, value))
    .sort((a, b) => Number(b.sessions ?? b.pageviews ?? 0) - Number(a.sessions ?? a.pageviews ?? 0));
}

export async function GET(request: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();

  const overviewRes = await admin
    .rpc("get_site_visit_identity_overview", { p_days: days })
    .single<OverviewRow>();

  if (overviewRes.error && !isMissingAnalyticsError(overviewRes.error)) {
    return NextResponse.json({ error: overviewRes.error.message }, { status: 500 });
  }

  let visitsRes: any = await admin
    .from("site_visit_logs")
    .select(VISIT_SELECT_COLUMNS)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (isMissingIdentityColumnError(visitsRes.error)) {
    visitsRes = await admin
      .from("site_visit_logs")
      .select(LEGACY_VISIT_SELECT_COLUMNS)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
  }

  if (isMissingAnalyticsError(visitsRes.error)) {
    return NextResponse.json({
      configured: false,
      rangeDays: days,
      message: "site_visit_logs migration has not been applied yet.",
    });
  }

  if (visitsRes.error) {
    return NextResponse.json({ error: visitsRes.error.message }, { status: 500 });
  }

  const rows = normalizeVisitRows(visitsRes.data as Partial<VisitRow>[] | null);
  const ownHosts = getOwnHosts();
  const sessions = new Map<string, VisitRow>();
  const sessionPageviews = new Map<string, number>();
  const sourceMap = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number; detail: string | null }>();
  const platformMap = new Map<string, { label: string; visitors: Set<string>; sessions: Set<string>; pageviews: number }>();
  const landingMap = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number }>();
  const pageMap = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number }>();
  const dailyMap = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number }>();

  [...rows].reverse().forEach((row, index) => {
    const sessionId = getSessionId(row, index);
    if (!sessions.has(sessionId)) sessions.set(sessionId, row);
  });

  rows.forEach((row, index) => {
    const visitorId = getVisitorId(row, index);
    const sessionId = getSessionId(row, index);
    const path = getPath(row);
    const dateKey = formatDateKey(row.created_at);
    const platform = getClientPlatform(row);
    sessionPageviews.set(sessionId, (sessionPageviews.get(sessionId) ?? 0) + 1);

    const platformBucket = platformMap.get(platform.key) ?? {
      label: platform.label,
      visitors: new Set<string>(),
      sessions: new Set<string>(),
      pageviews: 0,
    };
    platformBucket.visitors.add(visitorId);
    platformBucket.sessions.add(sessionId);
    platformBucket.pageviews += 1;
    platformMap.set(platform.key, platformBucket);

    const pageBucket = pageMap.get(path) ?? { visitors: new Set<string>(), sessions: new Set<string>(), pageviews: 0 };
    pageBucket.visitors.add(visitorId);
    pageBucket.sessions.add(sessionId);
    pageBucket.pageviews += 1;
    pageMap.set(path, pageBucket);

    const dailyBucket = dailyMap.get(dateKey) ?? { visitors: new Set<string>(), sessions: new Set<string>(), pageviews: 0 };
    dailyBucket.visitors.add(visitorId);
    dailyBucket.sessions.add(sessionId);
    dailyBucket.pageviews += 1;
    dailyMap.set(dateKey, dailyBucket);
  });

  sessions.forEach((row, sessionId) => {
    const visitorId = getVisitorId(row, 0);
    const source = getSourceLabel(row, ownHosts);
    const sourceBucket =
      sourceMap.get(source) ?? {
        visitors: new Set<string>(),
        sessions: new Set<string>(),
        pageviews: 0,
        detail: row.utm_campaign || row.referrer_host || null,
      };
    sourceBucket.visitors.add(visitorId);
    sourceBucket.sessions.add(sessionId);
    sourceBucket.pageviews += sessionPageviews.get(sessionId) ?? 1;
    if (!sourceBucket.detail) sourceBucket.detail = row.utm_campaign || row.referrer_host || null;
    sourceMap.set(source, sourceBucket);

    const landingPath = getPath(row);
    const landingBucket = landingMap.get(landingPath) ?? {
      visitors: new Set<string>(),
      sessions: new Set<string>(),
      pageviews: 0,
    };
    landingBucket.visitors.add(visitorId);
    landingBucket.sessions.add(sessionId);
    landingBucket.pageviews += 1;
    landingMap.set(landingPath, landingBucket);
  });

  const sources = toCountList(Array.from(sourceMap.entries()), (source, value) => ({
    source,
    detail: value.detail,
    visitors: value.visitors?.size ?? 0,
    sessions: value.sessions?.size ?? 0,
    pageviews: value.pageviews ?? 0,
  })).slice(0, 20);

  const clientPlatforms = toCountList(Array.from(platformMap.entries()), (key, value) => ({
    key,
    label: value.label,
    visitors: value.visitors?.size ?? 0,
    sessions: value.sessions?.size ?? 0,
    pageviews: value.pageviews ?? 0,
  }));

  const landingPages = toCountList(Array.from(landingMap.entries()), (path, value) => ({
    path,
    visitors: value.visitors?.size ?? 0,
    sessions: value.sessions?.size ?? 0,
  })).slice(0, 20);

  const topPages = toCountList(Array.from(pageMap.entries()), (path, value) => ({
    path,
    visitors: value.visitors?.size ?? 0,
    sessions: value.sessions?.size ?? 0,
    pageviews: value.pageviews ?? 0,
  })).slice(0, 20);

  const daily = Array.from(dailyMap.entries())
    .map(([date, value]) => ({
      date,
      visitors: value.visitors.size,
      sessions: value.sessions.size,
      pageviews: value.pageviews,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentVisits = rows.slice(0, 80).map((row, index) => ({
    created_at: row.created_at,
    path: getPath(row),
    query_string: row.query_string,
    source: getSourceLabel(row, ownHosts),
    client_platform: getClientPlatform(row),
    referrer_host: row.referrer_host,
    referrer_url: row.referrer_url,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    user_agent: row.user_agent,
    user_id: row.user_id,
    ip_hash: row.ip_hash,
    visitor_key: row.visitor_key,
    session_key: getSessionId(row, index),
  }));

  let overview = overviewRes.data;
  let overviewExact = Boolean(overview);

  if (!overview) {
    let allVisitsRes: any = await admin
      .from("site_visit_logs")
      .select(VISIT_SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);

    if (isMissingIdentityColumnError(allVisitsRes.error)) {
      allVisitsRes = await admin
        .from("site_visit_logs")
        .select(LEGACY_VISIT_SELECT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
    }

    overview = buildFallbackOverview(normalizeVisitRows(allVisitsRes.data as Partial<VisitRow>[] | null), rows);
    overviewExact = false;
  }

  return NextResponse.json({
    configured: true,
    overviewExact,
    rangeDays: days,
    sampledRows: rows.length,
    generatedAt: new Date().toISOString(),
    overview,
    sources,
    clientPlatforms,
    landingPages,
    topPages,
    daily,
    recentVisits,
  });
}
