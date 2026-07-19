import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET() {
  const supabase = getAdminClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const [todayNew, activePosters, dueThisWeek, collectionSources] = await Promise.all([
    safeCount(
      supabase
        .from("posters")
        .select("id", { count: "exact", head: true })
        .eq("poster_status", "published")
        .gte("created_at", todayStart.toISOString()),
    ),
    safeCount(
      supabase
        .from("posters")
        .select("id", { count: "exact", head: true })
        .eq("poster_status", "published")
        .or(`application_end_at.is.null,application_end_at.gte.${now.toISOString()}`),
    ),
    safeCount(
      supabase
        .from("posters")
        .select("id", { count: "exact", head: true })
        .eq("poster_status", "published")
        .gte("application_end_at", now.toISOString())
        .lte("application_end_at", sevenDaysLater.toISOString()),
    ),
    safeCount(
      supabase
        .from("collection_sources")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "planned"]),
    ),
  ]);

  return NextResponse.json({
    todayNew,
    activePosters,
    dueThisWeek,
    collectionSources,
  });
}
