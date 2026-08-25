import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../../../lib/publicPosterVisibility";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

async function safeCount(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

async function safeRpcNumber(query: PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await query;
  if (error) return 0;
  const value = typeof data === "number" ? data : Number(data ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getKoreaDayStartIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(
    `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}T00:00:00+09:00`,
  ).toISOString();
}

export async function GET() {
  const supabase = getAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStartIso = getKoreaDayStartIso(now);
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const [todayNew, activePosters, dueThisWeek, publicInstitutions] = await Promise.all([
    safeCount(
      supabase
        .from("posters")
        .select("id", { count: "exact", head: true })
        .eq("poster_status", "published")
        .or(PUBLIC_POSTER_EXPOSURE_FILTER)
        .or(`published_at.gte.${todayStartIso},and(published_at.is.null,created_at.gte.${todayStartIso})`),
    ),
    safeRpcNumber(
      supabase.rpc("count_public_posters", {
        p_query: null,
        p_category_id: null,
        p_region_ids: null,
        p_include_closed: false,
      }),
    ),
    safeCount(
      supabase
        .from("posters")
        .select("id", { count: "exact", head: true })
        .eq("poster_status", "published")
        .or(PUBLIC_POSTER_EXPOSURE_FILTER)
        .or(`application_start_at.is.null,application_start_at.lte.${nowIso}`)
        .gte("application_end_at", nowIso)
        .lte("application_end_at", sevenDaysLater.toISOString()),
    ),
    safeCount(
      supabase
        .from("institutions")
        .select("id", { count: "exact", head: true })
        .eq("is_public", true)
        .not("slug", "is", null)
        .neq("slug", ""),
    ),
  ]);

  return NextResponse.json({
    todayNew,
    activePosters,
    dueThisWeek,
    collectionSources: publicInstitutions,
  });
}
