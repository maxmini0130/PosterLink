import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  readDiscoverySort,
  resolveTaxonomyByRouteValue,
  type DiscoveryPoster,
  type DiscoverySort,
  type DiscoveryTaxonomy,
} from "./discoveryRoutes";
import { isPosterAcceptingApplications } from "./posterApplication";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "./publicPosterVisibility";

const PUBLIC_POSTER_SELECT =
  "id,title,source_org_name,organizer_name,organizer_id,source_institution_id,application_institution_id,application_start_at,application_end_at,deadline_type,verification_status,verified_at,thumbnail_url,source_key,summary_short,created_at,updated_at,exposure_tier";

export type PublicDiscoveryFilters = {
  query?: string | null;
  category?: string | null;
  region?: string | null;
  sort?: string | null;
  includeClosed?: boolean;
  limit?: number;
};

export type PublicDiscoveryResult = {
  posters: DiscoveryPoster[];
  totalCount: number;
  categories: DiscoveryTaxonomy[];
  regions: DiscoveryTaxonomy[];
  selectedCategory: DiscoveryTaxonomy | null;
  selectedRegion: DiscoveryTaxonomy | null;
  sort: DiscoverySort;
};

export type PublicInstitution = {
  id: string;
  slug: string;
  name: string;
  institution_type: string | null;
  region_name: string | null;
  homepage_url: string | null;
  verification_status: string;
  trust_score: number | null;
  last_collected_at: string | null;
  organizedPosterCount: number;
  sourcedPosterCount: number;
  activePosterCount: number;
};

export function createPublicSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function fetchPublicTaxonomies(client = createPublicSupabaseClient()) {
  const [categoriesRes, regionsRes] = await Promise.all([
    client
      .from("categories")
      .select("id,name,code,parent_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    client
      .from("regions")
      .select("id,name,full_name,code,level,parent_id")
      .eq("is_active", true)
      .in("level", ["nation", "sido", "sigungu"])
      .order("level", { ascending: false })
      .order("full_name", { ascending: true }),
  ]);

  return {
    categories: ((categoriesRes.data ?? []) as DiscoveryTaxonomy[]).filter((item) => Boolean(item.id && item.name)),
    regions: ((regionsRes.data ?? []) as DiscoveryTaxonomy[]).filter((item) => Boolean(item.id && item.name)),
  };
}

export async function fetchPublicDiscovery(filters: PublicDiscoveryFilters = {}): Promise<PublicDiscoveryResult> {
  const client = createPublicSupabaseClient();
  const { categories, regions } = await fetchPublicTaxonomies(client);
  const selectedCategory = resolveTaxonomyByRouteValue(categories, filters.category);
  const selectedRegion = resolveTaxonomyByRouteValue(regions, filters.region);
  const sort = readDiscoverySort(filters.sort);
  const search = sanitizeSearchTerm(filters.query);
  const includeClosed = Boolean(filters.includeClosed || search);
  const regionIds = selectedRegion ? getRegionScopeIds(selectedRegion.id, regions) : null;
  const searchArgs = {
    p_query: search || null,
    p_category_id: selectedCategory?.id ?? null,
    p_region_ids: regionIds,
    p_include_closed: includeClosed,
    p_sort: sort === "deadline" ? "deadline" : "latest",
    p_limit: Math.min(Math.max(filters.limit ?? 240, 1), 500),
  };
  const [postersRes, countRes] = await Promise.all([
    client
      .rpc("search_public_posters", searchArgs)
      .select(PUBLIC_POSTER_SELECT),
    client.rpc("count_public_posters", {
      p_query: search || null,
      p_category_id: selectedCategory?.id ?? null,
      p_region_ids: regionIds,
      p_include_closed: includeClosed,
    }),
  ]);
  const posters = await enrichPublicPosters(client, (postersRes.data ?? []) as Record<string, unknown>[]);
  const filteredPosters = includeClosed ? posters : posters.filter(isAcceptingPoster);
  const totalCount = typeof countRes.data === "number" ? countRes.data : filteredPosters.length;
  return { posters: filteredPosters, totalCount, categories, regions, selectedCategory, selectedRegion, sort };
}

export async function fetchPublicInstitutions(search?: string | null): Promise<PublicInstitution[]> {
  const client = createPublicSupabaseClient();
  let query = client
    .from("institutions")
    .select("id,slug,name,institution_type,region_name,homepage_url,verification_status,trust_score,last_collected_at")
    .eq("is_public", true)
    .not("slug", "is", null)
    .neq("slug", "")
    .order("name", { ascending: true })
    .limit(500);

  const cleanedSearch = sanitizeSearchTerm(search);
  if (cleanedSearch) query = query.or(`name.ilike.%${cleanedSearch}%,region_name.ilike.%${cleanedSearch}%`);

  const [{ data: institutions, error }, { data: posterLinks }] = await Promise.all([
    query,
    client
      .from("posters")
      .select("organizer_id,source_institution_id,application_start_at,application_end_at,deadline_type")
      .eq("poster_status", "published")
      .or(PUBLIC_POSTER_EXPOSURE_FILTER)
      .limit(2000),
  ]);

  if (error) return [];

  return (institutions ?? []).map((institution: any) => {
    let organizedPosterCount = 0;
    let sourcedPosterCount = 0;
    let activePosterCount = 0;
    for (const poster of posterLinks ?? []) {
      const organized = poster.organizer_id === institution.id;
      const sourced = poster.source_institution_id === institution.id;
      if (organized) organizedPosterCount += 1;
      if (sourced) sourcedPosterCount += 1;
      if ((organized || sourced) && isAcceptingPoster(poster)) {
        activePosterCount += 1;
      }
    }
    return { ...institution, organizedPosterCount, sourcedPosterCount, activePosterCount } as PublicInstitution;
  }).sort((a, b) => (
    b.activePosterCount - a.activePosterCount
    || (b.organizedPosterCount + b.sourcedPosterCount) - (a.organizedPosterCount + a.sourcedPosterCount)
    || a.name.localeCompare(b.name, "ko")
  ));
}

export async function fetchPublicInstitution(slug: string) {
  const client = createPublicSupabaseClient();
  const { data, error } = await client
    .from("institutions")
    .select("id,slug,name,institution_type,region_name,homepage_url,verification_status,trust_score,last_collected_at")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (error || !data) return null;

  const { data: posters } = await client
    .from("posters")
    .select(PUBLIC_POSTER_SELECT)
    .eq("poster_status", "published")
    .or(PUBLIC_POSTER_EXPOSURE_FILTER)
    .or(`organizer_id.eq.${data.id},source_institution_id.eq.${data.id}`)
    .order("created_at", { ascending: false })
    .limit(60);

  const visiblePosters = ((posters ?? []) as Record<string, unknown>[]).filter((poster) =>
    isAcceptingPoster(poster),
  );
  const enriched = await enrichPublicPosters(client, visiblePosters);
  return {
    institution: {
      ...data,
      organizedPosterCount: visiblePosters.filter((poster: any) => poster.organizer_id === data.id).length,
      sourcedPosterCount: visiblePosters.filter((poster: any) => poster.source_institution_id === data.id).length,
      activePosterCount: visiblePosters.length,
    } as PublicInstitution,
    posters: enriched,
  };
}

function isAcceptingPoster(poster: {
  application_start_at?: string | null;
  application_end_at?: string | null;
  deadline_type?: string | null;
}) {
  return isPosterAcceptingApplications({
    applicationStartAt: poster.application_start_at,
    applicationEndAt: poster.application_end_at,
    deadlineType: poster.deadline_type,
  });
}

function getRegionScopeIds(regionId: string, regions: DiscoveryTaxonomy[]) {
  const selected = regions.find((region) => region.id === regionId);
  if (!selected || selected.level === "nation") return regions.map((region) => region.id);
  if (selected.level === "sido") {
    return [regionId, ...regions.filter((region) => region.parent_id === regionId).map((region) => region.id)];
  }
  return [regionId, ...(selected.parent_id ? [selected.parent_id] : [])];
}

async function enrichPublicPosters(client: SupabaseClient, posterRows: Record<string, unknown>[]) {
  const posterIds = posterRows.map((poster) => String(poster.id)).filter(Boolean);
  if (posterIds.length === 0) return [];

  const [categoryLinksRes, regionLinksRes, imagesRes] = await Promise.all([
    client.from("poster_categories").select("poster_id,category_id").in("poster_id", posterIds),
    client.from("poster_regions").select("poster_id,region_id").in("poster_id", posterIds),
    client
      .from("poster_images")
      .select("poster_id,storage_path,image_type,created_at")
      .in("poster_id", posterIds)
      .order("created_at", { ascending: true }),
  ]);

  const categoryIds = [...new Set((categoryLinksRes.data ?? []).map((row: any) => row.category_id).filter(Boolean))];
  const regionIds = [...new Set((regionLinksRes.data ?? []).map((row: any) => row.region_id).filter(Boolean))];
  const [categoriesRes, regionsRes] = await Promise.all([
    categoryIds.length
      ? client.from("categories").select("id,name").in("id", categoryIds)
      : Promise.resolve({ data: [] }),
    regionIds.length
      ? client.from("regions").select("id,name,full_name,level").in("id", regionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const categoryNames = new Map((categoriesRes.data ?? []).map((row: any) => [row.id, row.name]));
  const regionNames = new Map(
    (regionsRes.data ?? []).map((row: any) => [row.id, row.level === "sigungu" ? row.full_name || row.name : row.name]),
  );
  const categoriesByPoster = groupValues(categoryLinksRes.data ?? [], "category_id");
  const regionsByPoster = groupValues(regionLinksRes.data ?? [], "region_id");
  const imagesByPoster = new Map<string, string[]>();
  for (const image of imagesRes.data ?? []) {
    if (!image.poster_id || !image.storage_path) continue;
    imagesByPoster.set(image.poster_id, [...(imagesByPoster.get(image.poster_id) ?? []), image.storage_path]);
  }

  return posterRows.map((poster) => {
    const id = String(poster.id);
    const categoryIdsForPoster = categoriesByPoster.get(id) ?? [];
    const regionIdsForPoster = regionsByPoster.get(id) ?? [];
    const categoryId = categoryIdsForPoster[0] ?? null;
    const regionId = regionIdsForPoster[0] ?? null;
    return {
      ...poster,
      id,
      categoryId,
      regionId,
      categoryIds: categoryIdsForPoster,
      regionIds: regionIdsForPoster,
      categoryName: categoryId ? String(categoryNames.get(categoryId) ?? "") || null : null,
      regionName: regionId ? String(regionNames.get(regionId) ?? "") || null : null,
      images: imagesByPoster.get(id) ?? [],
    } as DiscoveryPoster;
  });
}

function groupValues(rows: any[], valueKey: string) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.poster_id || !row[valueKey]) continue;
    grouped.set(row.poster_id, [...(grouped.get(row.poster_id) ?? []), row[valueKey]]);
  }
  return grouped;
}

function sanitizeSearchTerm(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/[,%_()*]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}
