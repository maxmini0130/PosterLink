import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPublicSupabaseClient,
  fetchPublicTaxonomies,
} from "./publicDiscovery";
import { getRegionScopeIds } from "./regionHelpers";
import {
  categoryScopeIds,
  CONTENT_TYPE_INTEREST,
  INTEREST_CATEGORY_CODES,
} from "./categoryTaxonomy";
import { taxonomySlug } from "./discoveryRoutes";
import { metadataForUrl } from "./posterImageMetadata";
import {
  benefitLine,
  cardMetaLine,
  regionPhrase,
  targetLabel,
  type CardRegion,
  type RegionBasis,
  type RegionEvidence,
} from "./cardFacts";
import {
  buildHomeLayout,
  HOME_PAGE_SIZE,
  type HomeConditions,
  type HomeLayout,
  type HomePoster,
  type OrgSuggestion,
} from "./homeFeed";

/** Read with the public (anon) key only; row-level security applies. */
const BASE_COLUMNS = [
  "id",
  "title",
  "organizer_name",
  "organizer_id",
  "application_start_at",
  "application_end_at",
  "deadline_type",
  "event_start_at",
  "event_end_at",
  "event_location",
  "eligibility_summary",
  "target_age_min",
  "target_age_max",
  "thumbnail_url",
  "source_key",
  "created_at",
  "published_at",
  "poster_status",
  "favorite_count",
  "primary_category_code:field_verification->classification->>primaryCategory",
  "fv_regions:field_verification->classification->regions",
  "audiences:field_verification->classification->audiences",
].join(",");

/** Columns of 20261103010000 (not applied everywhere yet). */
const CARD_FACT_COLUMNS =
  "benefit_summary,benefit_kind,event_schedule_kind,card_facts_status,featured_week";

type Row = {
  id: string;
  title: string;
  organizer_name: string | null;
  organizer_id: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  deadline_type: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  event_location: string | null;
  eligibility_summary: string | null;
  target_age_min: number | null;
  target_age_max: number | null;
  thumbnail_url: string | null;
  source_key: string | null;
  created_at: string | null;
  published_at: string | null;
  poster_status: string | null;
  favorite_count: number | null;
  primary_category_code: string | null;
  fv_regions: unknown;
  audiences: unknown;
  benefit_summary?: string | null;
  benefit_kind?: string | null;
  event_schedule_kind?: string | null;
  card_facts_status?: string | null;
  featured_week?: string | null;
};

type Taxonomy = Awaited<ReturnType<typeof fetchPublicTaxonomies>>;

function missingColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /column .* does not exist|could not find .* column/i.test(
        error.message ?? "",
      )),
  );
}

function chunks<T>(list: T[], size = 100) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function loadOpenRows(client: SupabaseClient): Promise<Row[]> {
  const search = (columns: string) =>
    client
      .rpc("search_public_posters", {
        p_query: null,
        p_category_id: null,
        p_region_ids: null,
        p_include_closed: false,
        p_sort: "latest",
        p_limit: 500,
      })
      .select(columns);
  let result = await search(`${BASE_COLUMNS},${CARD_FACT_COLUMNS}`);
  if (missingColumn(result.error)) result = await search(BASE_COLUMNS);
  if (result.error) throw new Error("home posters");
  return (Array.isArray(result.data) ? result.data : []) as unknown as Row[];
}

type RegionLink = {
  poster_id: string;
  region_id: string;
  basis?: string | null;
};

async function loadLinks(client: SupabaseClient, ids: string[]) {
  const regionLinks: RegionLink[] = [];
  const categoryLinks: Array<{ poster_id: string; category_id: string }> = [];
  let withBasis = true;
  const readRegions = (part: string[], columns: string) =>
    client
      .from("poster_regions")
      .select(columns)
      .in("poster_id", part)
      .returns<RegionLink[]>();
  for (const part of chunks(ids)) {
    let regions = await readRegions(
      part,
      withBasis ? "poster_id,region_id,basis" : "poster_id,region_id",
    );
    if (withBasis && missingColumn(regions.error)) {
      withBasis = false;
      regions = await readRegions(part, "poster_id,region_id");
    }
    const categories = await client
      .from("poster_categories")
      .select("poster_id,category_id")
      .in("poster_id", part);
    if (regions.error || categories.error) throw new Error("home links");
    regionLinks.push(...(regions.data ?? []));
    categoryLinks.push(...(categories.data ?? []));
  }
  return { regionLinks, categoryLinks };
}

async function loadImages(client: SupabaseClient, ids: string[]) {
  const result = new Map<string, Array<Record<string, unknown>>>();
  for (const part of chunks(ids)) {
    const { data, error } = await client
      .from("poster_images")
      .select("*")
      .in("poster_id", part);
    if (error) continue;
    for (const image of data ?? []) {
      const values = result.get(image.poster_id) ?? [];
      values.push(image);
      result.set(image.poster_id, values);
    }
  }
  return result;
}

/** 7-day favorites + views; the stored favorite count when the RPC is absent. */
async function loadPopularity(client: SupabaseClient, rows: Row[]) {
  const fallback = new Map(
    rows.map((row) => [row.id, row.favorite_count ?? 0]),
  );
  const { data, error } = await client.rpc("public_poster_popularity_7d", {
    p_poster_ids: rows.map((row) => row.id),
  });
  if (error || !Array.isArray(data)) return fallback;
  return new Map(
    (
      data as Array<{
        poster_id: string;
        favorites_7d: number;
        views_7d: number;
      }>
    ).map((row) => [
      row.poster_id,
      (row.favorites_7d ?? 0) * 3 + (row.views_7d ?? 0),
    ]),
  );
}

type InstitutionRow = { id: string; slug: string | null; name: string | null };

/** Organisers with new public posters in the last 30 days, most first. */
async function loadOrgSuggestions(
  institutions: (ids: string[]) => Promise<InstitutionRow[]>,
  rows: Row[],
  now: Date,
): Promise<OrgSuggestion[]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const at = Date.parse(row.published_at ?? row.created_at ?? "");
    if (!row.organizer_id || !(now.getTime() - at <= 30 * 86400000)) continue;
    counts.set(row.organizer_id, (counts.get(row.organizer_id) ?? 0) + 1);
  }
  if (counts.size < 3) return [];
  const found = await institutions([...counts.keys()].slice(0, 100));
  return found
    .filter((row) => row.slug && row.name)
    .map((row) => ({
      id: row.id,
      slug: row.slug as string,
      name: row.name as string,
      recentCount: counts.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.recentCount - a.recentCount);
}

function asEvidence(value: unknown): RegionEvidence[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RegionEvidence =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

/** Classification audience "youth" with source evidence, not an org name. */
function isYouth(row: Row, target: string | null) {
  if (target === "청년") return true;
  if (row.target_age_min != null && row.target_age_max != null)
    return row.target_age_min >= 15 && row.target_age_max <= 45;
  return (Array.isArray(row.audiences) ? row.audiences : []).some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { code?: string }).code === "youth" &&
      Number((item as { confidence?: number }).confidence ?? 0) >= 0.75 &&
      !/^(청년센터|청년공간)(,\s*)?$/.test(
        String((item as { evidence?: string }).evidence ?? ""),
      ),
  );
}

const BASES = new Set(["venue", "eligibility", "institution", "related"]);

function toHomePoster(
  row: Row,
  context: {
    regions: Map<string, Taxonomy["regions"][number]>;
    categories: Map<string, Taxonomy["categories"][number]>;
    regionLinks: RegionLink[];
    categoryIds: string[];
    images: Map<string, Array<Record<string, unknown>>>;
    popularity: number;
    now: Date;
  },
): HomePoster {
  const cardRegions: CardRegion[] = context.regionLinks.flatMap((link) => {
    const region = context.regions.get(link.region_id);
    if (!region) return [];
    return [
      {
        id: region.id,
        code: region.code ?? null,
        name: region.name,
        level: region.level ?? null,
        basis: BASES.has(String(link.basis))
          ? (link.basis as RegionBasis)
          : null,
      },
    ];
  });
  const primary = row.primary_category_code;
  const categoryCodes = context.categoryIds
    .map((id) => context.categories.get(id)?.code)
    .filter((code): code is string => Boolean(code));
  const interestCode =
    (primary && (CONTENT_TYPE_INTEREST[primary] ?? primary)) ||
    categoryCodes.map((code) => CONTENT_TYPE_INTEREST[code] ?? code)[0] ||
    null;
  const target = targetLabel({
    eligibilitySummary: row.eligibility_summary,
    targetAgeMin: row.target_age_min,
    targetAgeMax: row.target_age_max,
  });
  const schedule = {
    eventStartAt: row.event_start_at,
    eventEndAt: row.event_end_at,
    scheduleKind: row.event_schedule_kind ?? null,
  };
  const categoryName =
    context.categories.get(
      context.categoryIds.find(
        (id) => context.categories.get(id)?.code === primary,
      ) ?? context.categoryIds[0],
    )?.name ?? null;
  const verified =
    row.card_facts_status === "verified" &&
    Boolean(row.benefit_summary?.trim());
  return {
    id: row.id,
    publishedAt: Date.parse(row.published_at ?? row.created_at ?? "") || null,
    regionIds: context.regionLinks.map((link) => link.region_id),
    categoryIds: context.categoryIds,
    interestCode,
    application: {
      applicationStartAt: row.application_start_at,
      applicationEndAt: row.application_end_at,
      deadlineType: row.deadline_type,
      posterStatus: row.poster_status,
      eventEndAt: row.event_end_at,
    },
    schedule,
    benefitKind: row.benefit_kind ?? null,
    cardFactsStatus: row.card_facts_status ?? null,
    hasBenefit: verified,
    featuredWeek: row.featured_week ?? null,
    popularity: context.popularity,
    youth: isYouth(row, target),
    organizerKey:
      row.organizer_id ??
      (row.organizer_name?.trim()
        ? row.organizer_name.replace(/\s+/g, "").toLowerCase()
        : null),
    organizerId: row.organizer_id,
    card: {
      id: row.id,
      title: row.title,
      org: row.organizer_name ?? undefined,
      ...metadataForUrl(context.images.get(row.id), row.thumbnail_url),
      applicationStartAt: row.application_start_at,
      deadline: row.application_end_at ?? undefined,
      deadlineType: row.deadline_type,
      eventEndAt: row.event_end_at,
      tags: categoryName ? [categoryName] : [],
      image: row.thumbnail_url ?? undefined,
      sourceUrl: row.source_key ?? undefined,
      posterStatus: row.poster_status,
      organizerId: row.organizer_id,
      metaLine: cardMetaLine(
        regionPhrase(
          cardRegions,
          asEvidence(row.fv_regions),
          row.event_location,
        ),
        target,
      ),
      benefitLine: benefitLine(
        {
          ...schedule,
          benefitSummary: row.benefit_summary ?? null,
          cardFactsStatus: row.card_facts_status ?? null,
          primaryCategoryCode: primary,
        },
        context.now,
      ),
    },
  };
}

export type HomeRequest = {
  regionId?: string | null;
  categoryIds?: string[];
  /** Institutions the member follows (public ids sent by the browser). */
  followedIds?: string[];
  /** Member's last-visit baseline (ms). */
  since?: number | null;
  pageCount?: number;
};

export type HomeShortcut = {
  id: string;
  code: string;
  name: string;
  href: string;
};

export type HomeFeedResult = {
  layout: HomeLayout;
  /** The region the home is scoped to (조건 or 서울 by default). */
  scopeLabel: string;
  shortcuts: HomeShortcut[];
};

type HomeSource = {
  taxonomy: Taxonomy;
  rows: Row[];
  links: {
    regionLinks: RegionLink[];
    categoryLinks: Array<{ poster_id: string; category_id: string }>;
  };
  images: Map<string, Array<Record<string, unknown>>>;
  popularity: Map<string, number>;
  institutions: (ids: string[]) => Promise<InstitutionRow[]>;
};

async function loadDatabaseSource(): Promise<HomeSource> {
  const client = createPublicSupabaseClient();
  const [taxonomy, rows] = await Promise.all([
    fetchPublicTaxonomies(client),
    loadOpenRows(client),
  ]);
  const ids = rows.map((row) => row.id);
  const [links, images, popularity] = await Promise.all([
    loadLinks(client, ids),
    loadImages(client, ids),
    loadPopularity(client, rows),
  ]);
  return {
    taxonomy,
    rows,
    links,
    images,
    popularity,
    institutions: async (wanted) => {
      const { data, error } = await client
        .from("institutions")
        .select("id,slug,name")
        .eq("is_public", true)
        .in("id", wanted);
      return error ? [] : ((data ?? []) as InstitutionRow[]);
    },
  };
}

/**
 * Local review only: with UI_SHOWCASE=1 and HOME_FEED_FIXTURE=<json path>,
 * the home reads a fixture instead of the database, so every section can be
 * checked and screenshotted. Never active in deployed environments (Vercel
 * does not set UI_SHOWCASE). Dates in the fixture may be written relative to
 * now: {"$days": 3, "$hour": 18} = 3 days from today at 18:00 KST,
 * {"$weekday": 6} = this week's Saturday (KST, weeks start on Monday).
 */
async function loadFixtureSource(path: string, now: Date): Promise<HomeSource> {
  const { readFile } = await import("node:fs/promises");
  const today = Date.parse(
    `${new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10)}T00:00:00+09:00`,
  );
  const resolve = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const hour = Number(record.$hour ?? 12) * 3600000;
      if (typeof record.$days === "number")
        return new Date(today + record.$days * 86400000 + hour).toISOString();
      if (typeof record.$weekday === "number") {
        const weekday = (new Date(today + 9 * 3600000).getUTCDay() + 6) % 7;
        return new Date(
          today + (record.$weekday - 1 - weekday) * 86400000 + hour,
        ).toISOString();
      }
      return Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, resolve(v)]),
      );
    }
    return value;
  };
  const data = resolve(JSON.parse(await readFile(path, "utf8"))) as {
    taxonomy: Taxonomy;
    rows: Row[];
    regionLinks: RegionLink[];
    categoryLinks: Array<{ poster_id: string; category_id: string }>;
    institutions: InstitutionRow[];
    popularity?: Record<string, number>;
    images?: Array<Record<string, unknown> & { poster_id: string }>;
  };
  const images = new Map<string, Array<Record<string, unknown>>>();
  for (const image of data.images ?? [])
    images.set(image.poster_id, [
      ...(images.get(image.poster_id) ?? []),
      image,
    ]);
  return {
    taxonomy: data.taxonomy,
    rows: data.rows,
    links: { regionLinks: data.regionLinks, categoryLinks: data.categoryLinks },
    images,
    popularity: new Map(Object.entries(data.popularity ?? {})),
    institutions: async (wanted) =>
      data.institutions.filter((row) => wanted.includes(row.id)),
  };
}

function loadSource(now: Date) {
  const fixture = process.env.HOME_FEED_FIXTURE;
  if (process.env.UI_SHOWCASE === "1" && fixture)
    return loadFixtureSource(fixture, now);
  return loadDatabaseSource();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadHomeFeed(
  request: HomeRequest = {},
  now = new Date(),
): Promise<HomeFeedResult> {
  const source = await loadSource(now);
  const { taxonomy, rows } = source;
  const regions = new Map(
    taxonomy.regions.map((region) => [region.id, region]),
  );
  const categories = new Map(
    taxonomy.categories.map((category) => [category.id, category]),
  );
  const regionId =
    request.regionId &&
    UUID.test(request.regionId) &&
    regions.has(request.regionId)
      ? request.regionId
      : null;
  const chosen = regionId ? regions.get(regionId)! : null;
  // Default scope: 서울 (first-target market). A chosen region keeps its 시·도.
  const sidoId =
    chosen?.level === "sido"
      ? chosen.id
      : chosen?.level === "sigungu"
        ? (chosen.parent_id ?? null)
        : (taxonomy.regions.find((region) => region.code === "REG_SEOUL")?.id ??
          null);
  const scope = getRegionScopeIds(sidoId, taxonomy.regions);
  const { links, images, popularity } = source;
  const regionLinksBy = new Map<string, RegionLink[]>();
  for (const link of links.regionLinks)
    regionLinksBy.set(link.poster_id, [
      ...(regionLinksBy.get(link.poster_id) ?? []),
      link,
    ]);
  const categoriesBy = new Map<string, string[]>();
  for (const link of links.categoryLinks)
    categoriesBy.set(link.poster_id, [
      ...(categoriesBy.get(link.poster_id) ?? []),
      link.category_id,
    ]);
  const inScope = rows.filter((row) => {
    const own = regionLinksBy.get(row.id) ?? [];
    return (
      !scope || !own.length || own.some((link) => scope.has(link.region_id))
    );
  });
  const posters = inScope.map((row) =>
    toHomePoster(row, {
      regions,
      categories,
      regionLinks: regionLinksBy.get(row.id) ?? [],
      categoryIds: categoriesBy.get(row.id) ?? [],
      images,
      popularity: popularity.get(row.id) ?? 0,
      now,
    }),
  );
  const categoryIds = (request.categoryIds ?? []).filter(
    (id) => UUID.test(id) && categories.has(id),
  );
  const conditions: HomeConditions = {
    regionScope: regionId
      ? (getRegionScopeIds(regionId, taxonomy.regions) ?? new Set())
      : new Set(),
    categoryScope: new Set(
      categoryIds.flatMap((id) => categoryScopeIds(id, taxonomy.categories)),
    ),
  };
  const orgs = await loadOrgSuggestions(source.institutions, inScope, now);
  const layout = buildHomeLayout({
    posters,
    now,
    conditions,
    orgs,
    followedIds: new Set(
      (request.followedIds ?? []).filter((id) => UUID.test(id)).slice(0, 100),
    ),
    since:
      typeof request.since === "number" && Number.isFinite(request.since)
        ? request.since
        : null,
    pageCount: Math.min(Math.max(request.pageCount ?? 1, 1), 20),
  });
  const sido = sidoId ? regions.get(sidoId) : null;
  const scopeLabel = chosen
    ? chosen.level === "sigungu"
      ? chosen.name
      : `${(chosen.name ?? "").replace(/특별시|광역시/, "")} 전체`
    : sido
      ? `${sido.name.replace(/특별시|광역시/, "")} 전체`
      : "전체 지역";
  const order: readonly string[] = INTEREST_CATEGORY_CODES;
  const shortcuts = taxonomy.categories
    .filter((category) => order.includes(String(category.code)))
    .sort(
      (a, b) => order.indexOf(String(a.code)) - order.indexOf(String(b.code)),
    )
    .map((category) => ({
      id: category.id,
      code: String(category.code),
      name: category.name,
      href: `/categories/${taxonomySlug(category, "CAT")}`,
    }));
  return { layout, scopeLabel, shortcuts };
}

export { HOME_PAGE_SIZE };
