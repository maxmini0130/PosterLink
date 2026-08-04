import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import { getPosterStructuredReadiness } from "../../../../lib/posterStructuredTrust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const OPERATOR_ROLES = new Set(["operator", "admin", "super_admin"]);
const DEFAULT_DAYS = 30;
const MAX_POSTERS = 200;
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");
const MODEL = process.env.OPENAI_OPERATOR_REPORT_MODEL?.trim() || "gpt-5-mini";

type PosterRow = {
  id: string;
  title: string | null;
  poster_status: string | null;
  created_at: string | null;
  application_end_at: string | null;
  deadline_type: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  organizer_name: string | null;
  application_organization_name: string | null;
  eligibility_summary: string | null;
  benefits_summary: string | null;
  application_method: string | null;
  required_documents: string | null;
  contact_info: string | null;
  event_location: string | null;
  verification_status: string | null;
  verified_at: string | null;
};

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function createUserClient(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      },
    );
  }
  return createSupabaseServerClient();
}

function clampDays(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
}

function countByPoster(rows: Array<{ poster_id: string | null }>, posterIds: string[]) {
  const counts = Object.fromEntries(posterIds.map((posterId) => [posterId, 0]));
  for (const row of rows) {
    if (row.poster_id && row.poster_id in counts) counts[row.poster_id] += 1;
  }
  return counts;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createCsvResponse(rows: Array<{
  title: string;
  status: string;
  views: number;
  clicks: number;
  favorites: number;
  engagementScore: number;
  clickThroughRate: number;
  saveRate: number;
  verificationStatus: string;
  structuredVerified: boolean;
  seoReady: boolean;
  calendarReady: boolean;
  deadlineNotificationReady: boolean;
}>, days: number) {
  const header = [
    "title",
    "status",
    "verification_status",
    "structured_verified",
    "seo_ready",
    "calendar_ready",
    "deadline_notification_ready",
    "views",
    "clicks",
    "favorites",
    "engagement_score",
    "click_through_rate",
    "save_rate",
  ];
  const csv = [
    header.join(","),
    ...rows.map((row) => [
      row.title,
      row.status,
      row.verificationStatus,
      row.structuredVerified,
      row.seoReady,
      row.calendarReady,
      row.deadlineNotificationReady,
      row.views,
      row.clicks,
      row.favorites,
      row.engagementScore,
      row.clickThroughRate,
      row.saveRate,
    ].map(csvCell).join(",")),
  ].join("\r\n");
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="posterlink-operator-report-${days}d.csv"`,
    },
  });
}

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function buildFallbackInsights({
  totals,
  topPosters,
  rangeDays,
  structured,
}: {
  totals: { views: number; clicks: number; favorites: number; published: number };
  topPosters: Array<{ title: string; views: number; clicks: number; favorites: number; score: number }>;
  rangeDays: number;
  structured: { verified: number; needsReview: number; unverified: number };
}) {
  const top = topPosters[0];
  const ctr = totals.views > 0 ? Math.round((totals.clicks / totals.views) * 1000) / 10 : 0;
  const saveRate = totals.views > 0 ? Math.round((totals.favorites / totals.views) * 1000) / 10 : 0;
  const lines = [
    `최근 ${rangeDays}일 동안 게시 공고 ${totals.published}건에서 조회 ${totals.views.toLocaleString()}회, 링크 클릭 ${totals.clicks.toLocaleString()}회, 저장 ${totals.favorites.toLocaleString()}회를 기록했습니다.`,
    `클릭 전환율은 ${ctr}%이고 저장률은 ${saveRate}%입니다.`,
  ];
  if (top) {
    lines.push(`가장 반응이 높은 공고는 "${top.title}"이며, 후속 홍보 소재로 재활용하기 좋습니다.`);
  }
  if (structured.verified === 0) {
    lines.push(`사람 검증을 마친 구조화 공고가 없어 SEO 확장, 캘린더, 마감 알림에는 아직 구조화 값을 사용하지 않습니다.`);
  } else {
    lines.push(`사람 검증 완료 ${structured.verified}건만 SEO 확장, 캘린더, 마감 알림의 신뢰 데이터로 사용합니다.`);
  }
  return lines;
}

async function generateAiInsights(summary: unknown, fallback: string[]) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { insights: fallback, aiGenerated: false };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: createOpenAiTimeoutSignal(),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: [
              "너는 기관 공고 운영자를 위한 성과 리포트 분석가다.",
              "아래 JSON을 바탕으로 한국어 인사이트 3문장을 작성한다.",
              "과장하지 말고, 숫자를 직접 언급하며, 다음 운영 액션을 포함한다.",
              "JSON만 보고 말할 수 없는 내용은 추측하지 않는다.",
              JSON.stringify(summary),
            ].join("\n"),
          }],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "operator_performance_insights",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                insights: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
              },
              required: ["insights"],
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
    const payload = await response.json();
    const outputText = payload.output_text
      ?? payload.output?.flatMap((item: any) => item.content ?? []).map((part: any) => part.text ?? "").join("\n")
      ?? "";
    const parsed = JSON.parse(outputText);
    const insights = Array.isArray(parsed.insights)
      ? parsed.insights.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [];
    return { insights: insights.length > 0 ? insights : fallback, aiGenerated: insights.length > 0 };
  } catch {
    return { insights: fallback, aiGenerated: false };
  }
}

export async function GET(request: NextRequest) {
  const userClient = await createUserClient(request);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!OPERATOR_ROLES.has(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const format = request.nextUrl.searchParams.get("format");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: posters, error: posterError } = await admin
    .from("posters")
    .select("id,title,poster_status,created_at,application_end_at,deadline_type,event_start_at,event_end_at,organizer_name,application_organization_name,eligibility_summary,benefits_summary,application_method,required_documents,contact_info,event_location,verification_status,verified_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_POSTERS);
  if (posterError) return NextResponse.json({ error: posterError.message }, { status: 500 });

  const posterRows = (posters ?? []) as PosterRow[];
  const posterIds = posterRows.map((poster) => poster.id);
  if (posterIds.length === 0) {
    if (format === "csv") {
      return createCsvResponse([], days);
    }
    const empty = {
      rangeDays: days,
      generatedAt: new Date().toISOString(),
      totals: { posters: 0, published: 0, review: 0, rejected: 0, views: 0, clicks: 0, favorites: 0, engagementScore: 0 },
      rates: { clickThroughRate: 0, saveRate: 0 },
      structured: {
        verified: 0,
        needsReview: 0,
        unverified: 0,
        rejected: 0,
        verificationMissingTimestamp: 0,
        seoReady: 0,
        calendarReady: 0,
        deadlineNotificationReady: 0,
      },
      insights: [`최근 ${days}일 기준으로 분석할 운영자 등록 공고가 없습니다.`],
      aiGenerated: false,
      topPosters: [],
    };
    return NextResponse.json(empty);
  }

  const [viewsRes, clicksRes, favoritesRes] = await Promise.all([
    admin.from("poster_view_logs").select("poster_id").in("poster_id", posterIds).gte("created_at", since).limit(10000),
    admin.from("poster_link_click_logs").select("poster_id").in("poster_id", posterIds).gte("created_at", since).limit(10000),
    admin.from("favorites").select("poster_id").in("poster_id", posterIds).limit(10000),
  ]);

  if (viewsRes.error || clicksRes.error || favoritesRes.error) {
    return NextResponse.json(
      { error: viewsRes.error?.message ?? clicksRes.error?.message ?? favoritesRes.error?.message },
      { status: 500 },
    );
  }

  const viewCounts = countByPoster(viewsRes.data ?? [], posterIds);
  const clickCounts = countByPoster(clicksRes.data ?? [], posterIds);
  const favoriteCounts = countByPoster(favoritesRes.data ?? [], posterIds);

  const rows = posterRows.map((poster) => {
    const views = viewCounts[poster.id] ?? 0;
    const clicks = clickCounts[poster.id] ?? 0;
    const favorites = favoriteCounts[poster.id] ?? 0;
    const readiness = getPosterStructuredReadiness(poster);
    return {
      id: poster.id,
      title: poster.title ?? "제목 없음",
      status: poster.poster_status ?? "",
      createdAt: poster.created_at,
      deadline: poster.application_end_at,
      views,
      clicks,
      favorites,
      engagementScore: views + clicks * 3 + favorites * 5,
      clickThroughRate: views > 0 ? clicks / views : 0,
      saveRate: views > 0 ? favorites / views : 0,
      verificationStatus: poster.verification_status ?? "unverified",
      structuredVerified: readiness.verified,
      seoReady: readiness.seoReady,
      calendarReady: readiness.calendarReady,
      deadlineNotificationReady: readiness.deadlineNotificationReady,
    };
  });

  const totals = {
    posters: rows.length,
    published: rows.filter((row) => row.status === "published").length,
    review: rows.filter((row) => row.status === "review").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    views: rows.reduce((sum, row) => sum + row.views, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    favorites: rows.reduce((sum, row) => sum + row.favorites, 0),
    engagementScore: rows.reduce((sum, row) => sum + row.engagementScore, 0),
  };
  const rates = {
    clickThroughRate: totals.views > 0 ? totals.clicks / totals.views : 0,
    saveRate: totals.views > 0 ? totals.favorites / totals.views : 0,
  };
  const structured = {
    verified: rows.filter((row) => row.structuredVerified).length,
    needsReview: rows.filter((row) => row.verificationStatus === "needs_review").length,
    unverified: rows.filter((row) => row.verificationStatus === "unverified").length,
    rejected: rows.filter((row) => row.verificationStatus === "rejected").length,
    verificationMissingTimestamp: rows.filter(
      (row) => row.verificationStatus === "verified" && !row.structuredVerified,
    ).length,
    seoReady: rows.filter((row) => row.seoReady).length,
    calendarReady: rows.filter((row) => row.calendarReady).length,
    deadlineNotificationReady: rows.filter((row) => row.deadlineNotificationReady).length,
  };
  const topPosters = [...rows].sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 10);
  const fallback = buildFallbackInsights({ totals, topPosters: topPosters.map((row) => ({
    title: row.title,
    views: row.views,
    clicks: row.clicks,
    favorites: row.favorites,
    score: row.engagementScore,
  })), rangeDays: days, structured });
  const { insights, aiGenerated } = await generateAiInsights(
    { rangeDays: days, totals, rates, structured, topPosters },
    fallback,
  );

  if (format === "csv") {
    return createCsvResponse(rows, days);
  }

  return NextResponse.json({
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    totals,
    rates,
    structured,
    insights,
    aiGenerated,
    topPosters,
  });
}
