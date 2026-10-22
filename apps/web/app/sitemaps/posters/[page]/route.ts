import { createPublicSupabaseClient } from "../../../../lib/publicDiscovery";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../../../lib/publicPosterVisibility";
import { getAppOrigin } from "../../../../lib/siteUrl";
import {
  SITEMAP_PAGE_SIZE,
  sitemapXml,
  sitemapResponse,
} from "../../../../lib/sitemapXml";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: { page: string } },
) {
  if (!/^(0|[1-9][0-9]*)\.xml$/.test(params.page))
    return new Response("Not found", { status: 404 });
  const page = Number(params.page.slice(0, -4));
  const offset = page * SITEMAP_PAGE_SIZE;
  if (!Number.isSafeInteger(offset) || offset > 2147482647)
    return new Response("Not found", { status: 404 });
  const { data, error } = await createPublicSupabaseClient()
    .from("posters")
    .select("id,updated_at")
    .in("poster_status", ["published", "closed"])
    .or(PUBLIC_POSTER_EXPOSURE_FILTER)
    .order("id")
    .range(offset, offset + SITEMAP_PAGE_SIZE - 1);
  if (error)
    return new Response("Sitemap temporarily unavailable", { status: 503 });
  if (!data?.length) return new Response("Not found", { status: 404 });
  return sitemapResponse(
    sitemapXml(
      data.map((row) => ({
        url: `${getAppOrigin()}/posters/${row.id}`,
        updatedAt: row.updated_at,
      })),
    ),
  );
}
