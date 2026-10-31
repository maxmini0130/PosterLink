import { createPublicSupabaseClient } from "../../lib/publicDiscovery";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../lib/publicPosterVisibility";
import { getAppOrigin } from "../../lib/siteUrl";
import {
  SITEMAP_PAGE_SIZE,
  sitemapXml,
  sitemapResponse,
} from "../../lib/sitemapXml";
export const dynamic = "force-dynamic";
export async function GET() {
  const { count, error } = await createPublicSupabaseClient()
    .from("posters")
    .select("id", { count: "exact", head: true })
    .in("poster_status", ["published", "closed"])
    .or(PUBLIC_POSTER_EXPOSURE_FILTER);
  if (error || count === null)
    return new Response("Sitemap temporarily unavailable", { status: 503 });
  const origin = getAppOrigin();
  return sitemapResponse(
    sitemapXml(
      [
        { url: `${origin}/sitemap.xml` },
        ...Array.from(
          { length: Math.ceil(count / SITEMAP_PAGE_SIZE) },
          (_, page) => ({ url: `${origin}/sitemaps/posters/${page}.xml` }),
        ),
      ],
      true,
    ),
  );
}
