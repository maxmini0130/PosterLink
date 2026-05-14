import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

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

async function countCrawlerPosters(
  admin: ReturnType<typeof createAdminClient>,
  options: { status?: string; since?: string; missingImage?: boolean } = {}
) {
  let query = admin
    .from("posters")
    .select("id", { count: "exact", head: true })
    .not("source_key", "is", null);

  if (options.status) query = query.eq("poster_status", options.status);
  if (options.since) query = query.gte("created_at", options.since);
  if (options.missingImage) query = query.is("thumbnail_url", null);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    total,
    review,
    published,
    rejected,
    draft,
    hidden,
    last24hCount,
    missingImages,
    recentRes,
  ] = await Promise.all([
    countCrawlerPosters(admin),
    countCrawlerPosters(admin, { status: "review" }),
    countCrawlerPosters(admin, { status: "published" }),
    countCrawlerPosters(admin, { status: "rejected" }),
    countCrawlerPosters(admin, { status: "draft" }),
    countCrawlerPosters(admin, { status: "hidden" }),
    countCrawlerPosters(admin, { since: last24h }),
    countCrawlerPosters(admin, { missingImage: true }),
    admin
      .from("posters")
      .select("id, title, source_org_name, poster_status, created_at, application_end_at, thumbnail_url, source_key, summary_short")
      .not("source_key", "is", null)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (recentRes.error) throw recentRes.error;

  const recent = recentRes.data ?? [];
  const ids = recent.map((poster) => poster.id);
  const { data: links, error: linksError } = ids.length
    ? await admin
        .from("poster_links")
        .select("poster_id, url")
        .in("poster_id", ids)
        .eq("is_primary", true)
    : { data: [], error: null };

  if (linksError) throw linksError;

  const linkByPosterId = new Map((links ?? []).map((link) => [link.poster_id, link.url]));
  const sourceCounts: Record<string, number> = {};

  const rows = recent.map((poster) => {
    const sourceUrl = linkByPosterId.get(poster.id) ?? poster.source_key;
    let sourceHost = "unknown";
    try {
      sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      sourceHost = poster.source_org_name || "unknown";
    }
    sourceCounts[sourceHost] = (sourceCounts[sourceHost] ?? 0) + 1;
    return { ...poster, sourceUrl, sourceHost };
  });

  return NextResponse.json({
    stats: {
      total,
      review,
      published,
      rejected,
      draft,
      hidden,
      last24h: last24hCount,
      missingImages,
    },
    sourceCounts: Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    recent: rows,
  });
}
