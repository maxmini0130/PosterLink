import { MetadataRoute } from "next";
import { createServerClient } from "@supabase/ssr";
import { getAppOrigin } from "../lib/siteUrl";
import { taxonomySlug, type DiscoveryTaxonomy } from "../lib/discoveryRoutes";
import { isPosterAcceptingApplications } from "../lib/posterApplication";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../lib/publicPosterVisibility";

export const dynamic = "force-dynamic";

const appOrigin = getAppOrigin();
const SITEMAP_POSTER_SELECT = "id, updated_at, application_start_at, application_end_at, deadline_type";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: { get: () => undefined } }
  );

  const [{ data: feedPosters }, { data: archiveEvidence }] = await Promise.all([
    supabase
      .from("posters")
      .select(SITEMAP_POSTER_SELECT)
      .eq("poster_status", "published")
      .or(PUBLIC_POSTER_EXPOSURE_FILTER)
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("poster_field_evidence")
      .select("poster_id")
      .eq("field_key", "content_type")
      .in("value_text", ["news", "admin"])
      .gte("confidence", 0.8)
      .order("extracted_at", { ascending: false })
      .limit(1000),
  ]);
  const archivePosterIds = [...new Set((archiveEvidence ?? []).map((row: any) => row.poster_id).filter(Boolean))];
  const { data: archivePosters } = archivePosterIds.length
    ? await supabase
        .from("posters")
        .select(SITEMAP_POSTER_SELECT)
        .eq("poster_status", "published")
        .in("id", archivePosterIds)
        .order("updated_at", { ascending: false })
        .limit(1000)
    : { data: [] };
  const posters = uniquePostersById([...(feedPosters ?? []), ...(archivePosters ?? [])]);
  const posterIds = posters.map((poster) => poster.id);

  const [categoryLinksRes, regionLinksRes, categoriesRes, regionsRes, institutionsRes] = await Promise.all([
    posterIds.length
      ? supabase.from("poster_categories").select("poster_id,category_id").in("poster_id", posterIds)
      : Promise.resolve({ data: [] }),
    posterIds.length
      ? supabase.from("poster_regions").select("poster_id,region_id").in("poster_id", posterIds)
      : Promise.resolve({ data: [] }),
    supabase.from("categories").select("id,name,code").eq("is_active", true),
    supabase.from("regions").select("id,name,full_name,code,level,parent_id").eq("is_active", true),
    supabase
      .from("institutions")
      .select("slug,updated_at")
      .eq("is_public", true)
      .not("slug", "is", null)
      .neq("slug", "")
      .limit(500),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: appOrigin, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${appOrigin}/posters`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${appOrigin}/institutions`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${appOrigin}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${appOrigin}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  const posterRoutes: MetadataRoute.Sitemap = posters.map((poster) => {
    const active = isPosterAcceptingApplications({
      applicationStartAt: poster.application_start_at,
      applicationEndAt: poster.application_end_at,
      deadlineType: poster.deadline_type,
    });
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

  const categoryRoutes: MetadataRoute.Sitemap = categories
    .map((category) => ({
      url: `${appOrigin}/categories/${taxonomySlug(category, "CAT")}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    }));
  const regionRoutes: MetadataRoute.Sitemap = regions
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
  if (combinationKeys.size === 0) {
    for (const region of regions.filter((item) => item.level !== "nation").slice(0, 50)) {
      for (const category of categories.slice(0, 10)) {
        combinationKeys.add(`${region.id}:${category.id}`);
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

function uniquePostersById<T extends { id: string }>(posters: T[]) {
  const byId = new Map<string, T>();
  for (const poster of posters) {
    if (!byId.has(poster.id)) byId.set(poster.id, poster);
  }
  return [...byId.values()];
}

function groupLinkIds(rows: any[], valueKey: string, allowedPosterIds: Set<string>) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (!allowedPosterIds.has(row.poster_id) || !row[valueKey]) continue;
    grouped.set(row.poster_id, [...(grouped.get(row.poster_id) ?? []), row[valueKey]]);
  }
  return grouped;
}
