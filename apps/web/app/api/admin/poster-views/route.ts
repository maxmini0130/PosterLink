import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import {
  aggregatePosterViews,
  getPosterViewPeriodStart,
  parsePosterViewPeriod,
  type PosterClickLogRow,
  type PosterViewLogRow,
} from "../../../../lib/posterViewStats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const PAGE_SIZE = 1000;
const MAX_LOG_ROWS = 50000;
const POSTER_ID_CHUNK = 150;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type PosterInfo = {
  id: string;
  title: string | null;
  poster_status: string | null;
  application_end_at: string | null;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

// Reads every log row since `sinceIso`, PAGE_SIZE at a time, so the PostgREST
// row cap never silently truncates the count. Stops at MAX_LOG_ROWS and says so.
async function readAllLogs<T>(
  supabase: SessionClient,
  table: "poster_view_logs" | "poster_link_click_logs",
  columns: string,
  sinceIso: string,
  signal: AbortSignal,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_LOG_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(signal);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function readPosters(
  supabase: SessionClient,
  posterIds: string[],
  signal: AbortSignal,
): Promise<Map<string, PosterInfo>> {
  const posters = new Map<string, PosterInfo>();
  for (let i = 0; i < posterIds.length; i += POSTER_ID_CHUNK) {
    const chunk = posterIds.slice(i, i + POSTER_ID_CHUNK);
    const { data, error } = await supabase
      .from("posters")
      .select("id, title, poster_status, application_end_at")
      .in("id", chunk)
      .abortSignal(signal);
    if (error) throw new Error(`posters: ${error.message}`);
    for (const poster of (data ?? []) as PosterInfo[]) posters.set(poster.id, poster);
  }
  return posters;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // Admin role is re-checked on the server; the log tables are then read with
  // the same session, so their admin-only RLS policies still apply.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return errorResponse("로그인이 필요합니다.", 401);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError) return errorResponse("권한을 확인하지 못했습니다.", 503);
  if (!ADMIN_ROLES.has(profile?.role ?? "")) return errorResponse("관리자 권한이 필요합니다.", 403);

  const days = parsePosterViewPeriod(request.nextUrl.searchParams.get("days"));
  const now = new Date();
  const since = getPosterViewPeriodStart(days, now).toISOString();
  const signal = AbortSignal.timeout(25000);

  try {
    const [views, clicks] = await Promise.all([
      readAllLogs<PosterViewLogRow>(
        supabase,
        "poster_view_logs",
        "poster_id, visitor_key, created_at",
        since,
        signal,
      ),
      readAllLogs<PosterClickLogRow>(supabase, "poster_link_click_logs", "poster_id", since, signal),
    ]);

    const { rows, totals } = aggregatePosterViews(views.rows, clicks.rows, now);
    const posters = await readPosters(
      supabase,
      rows.map((row) => row.posterId),
      signal,
    );

    return NextResponse.json(
      {
        days,
        since,
        generatedAt: now.toISOString(),
        truncated: views.truncated || clicks.truncated,
        totals,
        rows: rows.map((row) => {
          const poster = posters.get(row.posterId);
          return {
            ...row,
            title: poster?.title ?? null,
            status: poster?.poster_status ?? null,
            applicationEndAt: poster?.application_end_at ?? null,
            // Logs cascade on poster delete; this only flags a poster the
            // session could not read (e.g. deleted between the two queries).
            missing: !poster,
          };
        }),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return errorResponse(
      timedOut ? "조회수 집계 시간이 초과되었습니다. 기간을 줄여 다시 시도해 주세요." : "조회수를 불러오지 못했습니다.",
      timedOut ? 504 : 500,
    );
  }
}
