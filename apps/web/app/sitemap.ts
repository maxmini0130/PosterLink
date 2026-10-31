import type { MetadataRoute } from "next";
import {
  createPublicSupabaseClient,
  fetchPublicTaxonomies,
  fetchTopRegionCategoryCombinations,
} from "../lib/publicDiscovery";
import { getAppOrigin } from "../lib/siteUrl";
import { taxonomySlug } from "../lib/discoveryRoutes";

export const dynamic = "force-dynamic";

// Poster URLs are served separately through /sitemap-index.xml.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const client = createPublicSupabaseClient();
  const origin = getAppOrigin();
  const [{ categories, regions }, combinations] = await Promise.all([
    fetchPublicTaxonomies(client),
    fetchTopRegionCategoryCombinations(500),
  ]);
  const routes: MetadataRoute.Sitemap = [
    "",
    "/posters",
    "/institutions",
    "/privacy",
    "/terms",
  ].map((path) => ({ url: `${origin}${path}` }));
  routes.push(
    ...categories.map((item) => ({
      url: `${origin}/categories/${taxonomySlug(item, "CAT")}`,
    })),
  );
  routes.push(
    ...regions.map((item) => ({
      url: `${origin}/regions/${taxonomySlug(item, "REG")}`,
    })),
  );
  routes.push(
    ...combinations.map((item) => ({
      url: `${origin}/regions/${item.regionSlug}/${item.categorySlug}`,
    })),
  );
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("institutions")
      .select("id,slug,updated_at")
      .eq("is_public", true)
      .not("slug", "is", null)
      .neq("slug", "")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("Public institution sitemap lookup failed");
    for (const item of data ?? [])
      routes.push({
        url: `${origin}/institutions/${encodeURIComponent(item.slug)}`,
        ...(item.updated_at ? { lastModified: item.updated_at } : {}),
      });
    if (!data || data.length < 1000) break;
  }
  return routes;
}
