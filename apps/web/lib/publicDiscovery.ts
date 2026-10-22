import "server-only";
import { getRegionScopeIds } from "./regionHelpers";
import { isPosterEligibleForPromotion } from "./promotionEligibility";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  readDiscoverySort,
  resolveTaxonomyByRouteValue,
  taxonomySlug,
  type DiscoveryPoster,
  type DiscoverySort,
  type DiscoveryTaxonomy,
} from "./discoveryRoutes";
import { isPosterAcceptingApplications } from "./posterApplication";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "./publicPosterVisibility";
import {
  INFORMATION_CATEGORY_CODES,
  isInformationCategory,
  isInformationalPoster,
  isClosedCategoryPoster,
} from "./categoryContent";
import { assertPublicDiscoveryQuery } from "./publicDiscoveryErrors";

const PUBLIC_POSTER_SELECT =
  "id,title,source_org_name,organizer_name,organizer_id,source_institution_id,application_institution_id,application_start_at,application_end_at,deadline_type,verification_status,verified_at,thumbnail_url,source_key,summary_short,created_at,updated_at,exposure_tier,primary_category_code:field_verification->classification->>primaryCategory";
const PROMOTION_POSTER_SELECT = `${PUBLIC_POSTER_SELECT},deadline_review:field_verification->deadlineReview,date_quality_decision:field_verification->dateQuality->>decision,date_issues:field_verification->dateIssues`;

export type PublicDiscoveryFilters = {
  query?: string | null;
  category?: string | null;
  region?: string | null;
  sort?: string | null;
  includeClosed?: boolean;
  limit?: number;
  regionScope?: "hierarchy" | "exact";
  promotionOnly?: boolean;
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

export type TopDiscoveryCombination = {
  regionName: string;
  regionSlug: string;
  categoryName: string;
  categorySlug: string;
  count: number;
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
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}

export async function fetchPublicTaxonomies(
  client = createPublicSupabaseClient(),
) {
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

  assertPublicDiscoveryQuery(categoriesRes, "categories");
  assertPublicDiscoveryQuery(regionsRes, "regions");
  return {
    categories: ((categoriesRes.data ?? []) as DiscoveryTaxonomy[]).filter(
      (item) => Boolean(item.id && item.name),
    ),
    regions: ((regionsRes.data ?? []) as DiscoveryTaxonomy[]).filter((item) =>
      Boolean(item.id && item.name),
    ),
  };
}

export async function fetchPublicDiscovery(
  filters: PublicDiscoveryFilters = {},
  client = createPublicSupabaseClient(),
  taxonomies?: Awaited<ReturnType<typeof fetchPublicTaxonomies>>,
): Promise<PublicDiscoveryResult> {
  const { categories, regions } =
    taxonomies ?? (await fetchPublicTaxonomies(client));
  const selectedCategory = resolveTaxonomyByRouteValue(
    categories,
    filters.category,
  );
  const selectedRegion = resolveTaxonomyByRouteValue(regions, filters.region);
  const sort = readDiscoverySort(filters.sort);
  const search = sanitizeSearchTerm(filters.query);
  const includeClosed = Boolean(filters.includeClosed || search);
  const regionIds = selectedRegion
    ? filters.regionScope === "exact"
      ? [selectedRegion.id]
      : Array.from(getRegionScopeIds(selectedRegion.id, regions) ?? [])
    : null;
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
      .select(
        filters.promotionOnly ? PROMOTION_POSTER_SELECT : PUBLIC_POSTER_SELECT,
      )
      .returns<Record<string, unknown>[]>(),
    filters.promotionOnly
      ? Promise.resolve({ data: null, error: null })
      : client.rpc("count_public_posters", {
          p_query: search || null,
          p_category_id: selectedCategory?.id ?? null,
          p_region_ids: regionIds,
          p_include_closed: includeClosed,
        }),
  ]);
  assertPublicDiscoveryQuery(postersRes, "search_public_posters");
  assertPublicDiscoveryQuery(countRes, "count_public_posters");
  const rows = postersRes.data ?? [];
  const posters = await enrichPublicPosters(
    client,
    filters.promotionOnly ? rows.filter(isPosterEligibleForPromotion) : rows,
  );
  const filteredPosters = includeClosed
    ? posters
    : posters.filter(isAcceptingPoster);
  const totalCount =
    !filters.promotionOnly && typeof countRes.data === "number"
      ? countRes.data
      : filteredPosters.length;
  return {
    posters: filteredPosters,
    totalCount,
    categories,
    regions,
    selectedCategory,
    selectedRegion,
    sort,
  };
}

export type CategorySupplement = {
  posters: DiscoveryPoster[];
  totalCount: number;
};

// Category-only additions: retain the existing active RPC and search filters.
export async function fetchCategorySupplements(
  category: DiscoveryTaxonomy,
  client = createPublicSupabaseClient(),
) {
  const select = `${PUBLIC_POSTER_SELECT},poster_status,poster_categories!inner(category_id)`;
  const base = () =>
    client
      .from("posters")
      .select(select, { count: "exact" })
      .eq("poster_categories.category_id", category.id)
      .or(PUBLIC_POSTER_EXPOSURE_FILTER);
  const now = new Date().toISOString();
  const [closed, information] = await Promise.all([
    base()
      .in("poster_status", ["published", "closed"])
      .or(`poster_status.eq.closed,application_end_at.lt.${now}`)
      .order("application_end_at", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(6)
      .returns<Record<string, unknown>[]>(),
    isInformationCategory(category.code)
      ? base()
          .eq("poster_status", "published")
          .in("field_verification->classification->>primaryCategory", [
            ...INFORMATION_CATEGORY_CODES,
          ])
          .is("application_start_at", null)
          .is("application_end_at", null)
          .or("deadline_type.is.null,deadline_type.eq.unknown")
          .order("created_at", { ascending: false })
          .order("id")
          .limit(6)
          .returns<Record<string, unknown>[]>()
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]);
  assertPublicDiscoveryQuery(closed, "category_closed");
  assertPublicDiscoveryQuery(information, "category_information");
  // Guard display roles independently of deadline inference; never mutate dates.
  const closedRows = (closed.data ?? []).filter((row) =>
    isClosedCategoryPoster(row),
  );
  const informationRows = (information.data ?? []).filter((row) =>
    isInformationalPoster(row),
  );
  const combined = await enrichPublicPosters(
    client,
    [...closedRows, ...informationRows],
    closedRows.map((row) => String(row.id)),
  );
  const byId = new Map(combined.map((poster) => [poster.id, poster]));
  const result = (
    rows: Record<string, unknown>[],
    count: number | null,
  ): CategorySupplement => ({
    posters: rows.flatMap((row) =>
      byId.has(String(row.id)) ? [byId.get(String(row.id))!] : [],
    ),
    totalCount: count ?? 0,
  });
  return {
    closed: result(closedRows, closed.count),
    information: result(informationRows, information.count),
  };
}

export async function fetchTopRegionCategoryCombinations(
  limit = 20,
): Promise<TopDiscoveryCombination[]> {
  const client = createPublicSupabaseClient();
  const { data: posterRows, error: posterError } = await client
    .rpc("search_public_posters", {
      p_query: null,
      p_category_id: null,
      p_region_ids: null,
      p_include_closed: false,
      p_sort: "latest",
      p_limit: 500,
    })
    .select("id,application_start_at,application_end_at,deadline_type");

  if (posterError) return [];

  const posterIds = (
    (posterRows ?? []) as Array<{
      id: string;
      application_start_at: string | null;
      application_end_at: string | null;
      deadline_type: string | null;
    }>
  )
    .filter(isAcceptingPoster)
    .map((poster) => poster.id);

  if (posterIds.length === 0) return [];

  const [categoryLinksRes, regionLinksRes, taxonomies] = await Promise.all([
    client
      .from("poster_categories")
      .select("poster_id,category_id")
      .in("poster_id", posterIds),
    client
      .from("poster_regions")
      .select("poster_id,region_id")
      .in("poster_id", posterIds),
    fetchPublicTaxonomies(client),
  ]);

  if (categoryLinksRes.error || regionLinksRes.error) return [];

  const categoriesByPoster = groupValues(
    categoryLinksRes.data ?? [],
    "category_id",
  );
  const regionsByPoster = groupValues(regionLinksRes.data ?? [], "region_id");
  const counts = new Map<string, Set<string>>();

  for (const posterId of posterIds) {
    for (const regionId of regionsByPoster.get(posterId) ?? []) {
      for (const categoryId of categoriesByPoster.get(posterId) ?? []) {
        const key = `${regionId}:${categoryId}`;
        const countedPosters = counts.get(key) ?? new Set<string>();
        countedPosters.add(posterId);
        counts.set(key, countedPosters);
      }
    }
  }

  const regionsById = new Map(
    taxonomies.regions.map((region) => [region.id, region]),
  );
  const categoriesById = new Map(
    taxonomies.categories.map((category) => [category.id, category]),
  );

  return [...counts.entries()]
    .flatMap(([key, countedPosters]) => {
      const [regionId, categoryId] = key.split(":");
      const region = regionsById.get(regionId);
      const category = categoriesById.get(categoryId);
      if (!region || !category) return [];

      return [
        {
          regionName: region.name,
          regionSlug: taxonomySlug(region, "REG"),
          categoryName: category.name,
          categorySlug: taxonomySlug(category, "CAT"),
          count: countedPosters.size,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.regionName.localeCompare(b.regionName, "ko") ||
        a.categoryName.localeCompare(b.categoryName, "ko"),
    )
    .slice(0, Math.max(0, limit));
}

export async function fetchPublicInstitutions(
  search?: string | null,
): Promise<PublicInstitution[]> {
  const client = createPublicSupabaseClient();
  let query = client
    .from("institutions")
    .select(
      "id,slug,name,institution_type,region_name,homepage_url,verification_status,trust_score,last_collected_at",
    )
    .eq("is_public", true)
    .not("slug", "is", null)
    .neq("slug", "")
    .order("name", { ascending: true })
    .limit(500);

  const cleanedSearch = sanitizeSearchTerm(search);
  if (cleanedSearch)
    query = query.or(
      `name.ilike.%${cleanedSearch}%,region_name.ilike.%${cleanedSearch}%`,
    );

  const [{ data: institutions, error }, { data: posterLinks }] =
    await Promise.all([
      query,
      client
        .from("posters")
        .select(
          "organizer_id,source_institution_id,application_start_at,application_end_at,deadline_type",
        )
        .eq("poster_status", "published")
        .or(PUBLIC_POSTER_EXPOSURE_FILTER)
        .limit(2000),
    ]);

  if (error) return [];

  return (institutions ?? [])
    .map((institution: any) => {
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
      return {
        ...institution,
        organizedPosterCount,
        sourcedPosterCount,
        activePosterCount,
      } as PublicInstitution;
    })
    .sort(
      (a, b) =>
        b.activePosterCount - a.activePosterCount ||
        b.organizedPosterCount +
          b.sourcedPosterCount -
          (a.organizedPosterCount + a.sourcedPosterCount) ||
        a.name.localeCompare(b.name, "ko"),
    );
}

export async function fetchPublicInstitution(slug: string) {
  const client = createPublicSupabaseClient();
  const { data, error } = await client
    .from("institutions")
    .select(
      "id,slug,name,institution_type,region_name,homepage_url,verification_status,trust_score,last_collected_at",
    )
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

  const visiblePosters = ((posters ?? []) as Record<string, unknown>[]).filter(
    (poster) => isAcceptingPoster(poster),
  );
  const enriched = await enrichPublicPosters(client, visiblePosters);
  return {
    institution: {
      ...data,
      organizedPosterCount: visiblePosters.filter(
        (poster: any) => poster.organizer_id === data.id,
      ).length,
      sourcedPosterCount: visiblePosters.filter(
        (poster: any) => poster.source_institution_id === data.id,
      ).length,
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

async function enrichPublicPosters(
  client: SupabaseClient,
  posterRows: Record<string, unknown>[],
  imagePosterIds?: string[],
) {
  const posterIds = posterRows
    .map((poster) => String(poster.id))
    .filter(Boolean);
  if (posterIds.length === 0) return [];
  const imageIds = imagePosterIds ?? posterIds;

  const [categoryLinksRes, regionLinksRes, imagesRes] = await Promise.all([
    client
      .from("poster_categories")
      .select("poster_id,category_id")
      .in("poster_id", posterIds),
    client
      .from("poster_regions")
      .select("poster_id,region_id")
      .in("poster_id", posterIds),
    imageIds.length
      ? client
          .from("poster_images")
          .select("poster_id,storage_path,image_type,created_at")
          .in("poster_id", imageIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  assertPublicDiscoveryQuery(categoryLinksRes, "poster_categories");
  assertPublicDiscoveryQuery(regionLinksRes, "poster_regions");
  assertPublicDiscoveryQuery(imagesRes, "poster_images");

  const categoryIds = [
    ...new Set(
      (categoryLinksRes.data ?? [])
        .map((row: any) => row.category_id)
        .filter(Boolean),
    ),
  ];
  const regionIds = [
    ...new Set(
      (regionLinksRes.data ?? [])
        .map((row: any) => row.region_id)
        .filter(Boolean),
    ),
  ];
  const [categoriesRes, regionsRes] = await Promise.all([
    categoryIds.length
      ? client.from("categories").select("id,name,code").in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    regionIds.length
      ? client
          .from("regions")
          .select("id,name,full_name,level")
          .in("id", regionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  assertPublicDiscoveryQuery(categoriesRes, "poster_category_names");
  assertPublicDiscoveryQuery(regionsRes, "poster_region_names");

  const categoryNames = new Map(
    (categoriesRes.data ?? []).map((row: any) => [row.id, row.name]),
  );
  const categoryCodes = new Map(
    (categoriesRes.data ?? []).map((row: any) => [row.id, row.code]),
  );
  const regionNames = new Map(
    (regionsRes.data ?? []).map((row: any) => [
      row.id,
      row.level === "sigungu" ? row.full_name || row.name : row.name,
    ]),
  );
  const categoriesByPoster = groupValues(
    categoryLinksRes.data ?? [],
    "category_id",
  );
  const regionsByPoster = groupValues(regionLinksRes.data ?? [], "region_id");
  const imagesByPoster = new Map<string, string[]>();
  for (const image of imagesRes.data ?? []) {
    if (!image.poster_id || !image.storage_path) continue;
    imagesByPoster.set(image.poster_id, [
      ...(imagesByPoster.get(image.poster_id) ?? []),
      image.storage_path,
    ]);
  }

  return posterRows.map((poster) => {
    const id = String(poster.id);
    const categoryIdsForPoster = categoriesByPoster.get(id) ?? [];
    const regionIdsForPoster = regionsByPoster.get(id) ?? [];
    const primaryCategoryCode = readPrimaryCategoryCode(
      poster.primary_category_code,
    );
    const categoryId = pickPrimaryCategoryId(
      categoryIdsForPoster,
      categoryCodes,
      primaryCategoryCode,
    );
    const regionId = regionIdsForPoster[0] ?? null;
    return {
      ...poster,
      id,
      categoryId,
      regionId,
      categoryIds: categoryIdsForPoster,
      regionIds: regionIdsForPoster,
      categoryName: categoryId
        ? String(categoryNames.get(categoryId) ?? "") || null
        : null,
      regionName: regionId
        ? String(regionNames.get(regionId) ?? "") || null
        : null,
      images: imagesByPoster.get(id) ?? [],
    } as DiscoveryPoster;
  });
}

function readPrimaryCategoryCode(value: unknown) {
  const code = String(value ?? "").trim();
  return /^CAT_[A-Z_]+$/.test(code) ? code : null;
}

function pickPrimaryCategoryId(
  ids: string[],
  codes: Map<string, string>,
  primaryCode: string | null,
) {
  if (primaryCode) {
    const matched = ids.find((id) => codes.get(id) === primaryCode);
    if (matched) return matched;
  }
  return ids[0] ?? null;
}

function groupValues(rows: any[], valueKey: string) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.poster_id || !row[valueKey]) continue;
    grouped.set(row.poster_id, [
      ...(grouped.get(row.poster_id) ?? []),
      row[valueKey],
    ]);
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
