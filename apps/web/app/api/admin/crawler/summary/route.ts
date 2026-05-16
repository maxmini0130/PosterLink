import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const INVALID_TITLES = new Set(["작성자", "관리자", "번호", "제목", "공지사항", "조회수", "첨부파일", "maposc"]);
const MOJIBAKE_TOKENS = ["�", "怨듭", "濡쒓", "留곹", "議고", "?깅", "?뺤", "?곸", "?좎", "?꾩", "?섏", "?⑸", "?놁", "?덈", "?대"];
const BAD_IMAGE_TOKENS = ["wa_mark", "web_accessibility", "webaccessibility", "favicon"];

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

function getSuspicionReasons(poster: {
  title: string | null;
  summary_short: string | null;
  thumbnail_url: string | null;
}) {
  const reasons: string[] = [];
  const title = (poster.title ?? "").trim();
  const lowerImageUrl = (poster.thumbnail_url ?? "").toLowerCase();
  const text = `${poster.title ?? ""} ${poster.summary_short ?? ""}`;

  if (!title) reasons.push("제목 없음");
  if (INVALID_TITLES.has(title.toLowerCase()) || /^작성자\s*:/i.test(title)) {
    reasons.push("메타데이터 제목");
  }
  if (MOJIBAKE_TOKENS.some((token) => text.includes(token))) {
    reasons.push("깨진 문자 의심");
  }
  if (!poster.thumbnail_url) {
    reasons.push("이미지 없음");
  } else if (BAD_IMAGE_TOKENS.some((token) => lowerImageUrl.includes(token))) {
    reasons.push("포스터가 아닌 이미지 의심");
  }

  return reasons;
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
    qualityRes,
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
    admin
      .from("posters")
      .select("id, title, source_org_name, poster_status, created_at, application_end_at, thumbnail_url, source_key, summary_short")
      .not("source_key", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (recentRes.error) throw recentRes.error;
  if (qualityRes.error) throw qualityRes.error;

  const recent = recentRes.data ?? [];
  const qualityRows = qualityRes.data ?? [];
  const ids = Array.from(new Set([...recent, ...qualityRows].map((poster) => poster.id)));
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

  const decoratePoster = (poster: (typeof recent)[number]) => {
    const sourceUrl = linkByPosterId.get(poster.id) ?? poster.source_key;
    let sourceHost = "unknown";
    try {
      sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      sourceHost = poster.source_org_name || "unknown";
    }
    return { ...poster, sourceUrl, sourceHost };
  };

  const rows = recent.map((poster) => {
    const decorated = decoratePoster(poster);
    sourceCounts[decorated.sourceHost] = (sourceCounts[decorated.sourceHost] ?? 0) + 1;
    return decorated;
  });

  const suspicious = qualityRows
    .map((poster) => ({ ...decoratePoster(poster), suspicionReasons: getSuspicionReasons(poster) }))
    .filter((poster) => poster.suspicionReasons.length > 0)
    .slice(0, 30);

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
      suspicious: suspicious.length,
    },
    sourceCounts: Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    recent: rows,
    suspicious,
  });
}
