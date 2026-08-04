import { MetadataRoute } from "next";
import { createServerClient } from "@supabase/ssr";
import { getAppOrigin } from "../lib/siteUrl";
import { taxonomySlug, type DiscoveryTaxonomy } from "../lib/discoveryRoutes";

export const dynamic = "force-dynamic";

const appOrigin = getAppOrigin();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: { get: () => undefined } }
  );

  const { data: posters } = await supabase
    .from("posters")
    .select("id, updated_at, application_end_at")
    .eq("poster_status", "published")
    .order("updated_at", { ascending: false })
    .limit(1000);
  const posterIds = (posters ?? []).map((poster) => poster.id);

  const [categoryLinksRes, regionLinksRes, categoriesRes, regionsRes, institutionsRes] = await Promise.all([
    posterIds.length
      ? supabase.from("poster_categories").select("poster_id,category_id").in("poster_id", posterIds)
      : Promise.resolve({ data: [] }),
    posterIds.length
      ? supabase.from("poster_regions").select("poster_id,region_id").in("poster_id", posterIds)
      : Promise.resolve({ data: [] }),
    supabase.from("categories").select("id,name,code").eq("is_active", true),
    supabase.from("regions").select("id,name,full_name,code,level,parent_id").eq("is_active", true),
    supabase.from("institutions").select("slug,updated_at").eq("is_public", true).limit(500),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: appOrigin, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${appOrigin}/posters`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${appOrigin}/institutions`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${appOrigin}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${appOrigin}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  const now = Date.now();
  const posterRoutes: MetadataRoute.Sitemap = (posters ?? []).map((poster) => {
    const active = !poster.application_end_at || new Date(poster.application_end_at).getTime() >= now;
    return {
      url: `${appOrigin}/posters/${poster.id}`,
      lastModified: new Date(poster.updated_at ?? Date.now()),
      changeFrequency: active ? "daily" : "monthly",
      priority: active ? 0.8 : 0.5,
    };
  });

  const categories = (categoriesRes.data ?? []) as DiscoveryTaxonomy[];
  const regions = (regionsRes.data ?? []) as DiscoveryTaxonomy[];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const publishedIds = new Set(posterIds);
  const categoryIds = new Set(
    (categoryLinksRes.data ?? []).filter((link: any) => publishedIds.has(link.poster_id)).map((link: any) => link.category_id),
  );
  const regionIds = new Set(
    (regionLinksRes.data ?? []).filter((link: any) => publishedIds.has(link.poster_id)).map((link: any) => link.region_id),
  );

  const categoryRoutes: MetadataRoute.Sitemap = [...categoryIds]
    .map((id) => categoryById.get(id))
    .filter((item): item is DiscoveryTaxonomy => Boolean(item))
    .map((category) => ({
      url: `${appOrigin}/categories/${taxonomySlug(category, "CAT")}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    }));
  const regionRoutes: MetadataRoute.Sitemap = [...regionIds]
    .map((id) => regionById.get(id))
    .filter((item): item is DiscoveryTaxonomy => Boolean(item))
    .map((region) => ({
      url: `${appOrigin}/regions/${taxonomySlug(region, "REG")}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    }));

  const categoriesByPoster = groupLinkIds(categoryLinksRes.data ?? [], "category_id", publishedIds);
  const regionsByPoster = groupLinkIds(regionLinksRes.data ?? [], "region_id", publishedIds);
  const combinationKeys = new Set<string>();
  for (const posterId of posterIds) {
    for (const regionId of regionsByPoster.get(posterId) ?? []) {
      for (const categoryId of categoriesByPoster.get(posterId) ?? []) {
        combinationKeys.add(`${regionId}:${categoryId}`);
      }
    }
  }
  const combinationRoutes: MetadataRoute.Sitemap = [...combinationKeys].slice(0, 500).flatMap((key) => {
    const [regionId, categoryId] = key.split(":");
    const region = regionById.get(regionId);
    const category = categoryById.get(categoryId);
    if (!region || !category) return [];
    return [{
      url: `${appOrigin}/regions/${taxonomySlug(region, "REG")}/${taxonomySlug(category, "CAT")}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    }];
  });

  const institutionRoutes: MetadataRoute.Sitemap = (institutionsRes.data ?? []).map((institution: any) => ({
    url: `${appOrigin}/institutions/${institution.slug}`,
    lastModified: new Date(institution.updated_at ?? Date.now()),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [
    ...staticRoutes,
    ...posterRoutes,
    ...categoryRoutes,
    ...regionRoutes,
    ...combinationRoutes,
    ...institutionRoutes,
  ];
}

function groupLinkIds(rows: any[], valueKey: string, allowedPosterIds: Set<string>) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (!allowedPosterIds.has(row.poster_id) || !row[valueKey]) continue;
    grouped.set(row.poster_id, [...(grouped.get(row.poster_id) ?? []), row[valueKey]]);
  }
  return grouped;
}
