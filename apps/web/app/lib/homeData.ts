"use client";

import type { PlPosterCardData } from "../components/pl/PosterListCard";
import type { HomeItem } from "../../lib/homeSections";
import type { RegionNode } from "../../lib/searchGroups";
import { readGuestInterest } from "../../lib/guestInterest";
import { readGuestFavorites } from "../../lib/guestStore";
import { PUBLIC_POSTER_EXPOSURE_FILTER } from "../../lib/publicPosterVisibility";
import { searchInterestGroups, searchNearby } from "../../lib/homeQueries";
import { categoryScopeIds } from "../../lib/categoryTaxonomy";
import { guestLocal } from "./guestSession";
import { fetchCategoryRegionNames } from "./posterHelpers";
import { supabase } from "./supabase";

/** Interest conditions shown on the home button and used for the lists. */
export type HomeInterest = {
  region: { id: string; name: string } | null;
  categories: Array<{ id: string; name: string }>;
};

export type HomeData = {
  signedIn: boolean;
  interest: HomeInterest;
  interestItems: HomeItem<PlPosterCardData>[];
  /** Open posters for the other districts of the chosen 시·도. */
  nearbyItems: HomeItem<PlPosterCardData>[];
  latestItems: HomeItem<PlPosterCardData>[];
  favoriteItems: HomeItem<PlPosterCardData>[];
  followedItems: HomeItem<PlPosterCardData>[];
  institutions: Array<{ id: string; name: string; slug: string }>;
  /** The region tree, for grouping by region scope. */
  regions: RegionNode[];
  /** Interest category id -> the category ids it covers (for the chips). */
  categoryScopes: Record<string, string[]>;
};

const SELECT =
  "id,title,source_org_name,organizer_name,verification_status,verified_at,application_start_at,application_end_at,deadline_type,event_end_at,thumbnail_url,source_key,created_at,published_at,poster_status,source_institution_id,organizer_id";

type Row = {
  id: string;
  title: string;
  source_org_name: string | null;
  organizer_name: string | null;
  verification_status: string | null;
  verified_at: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  deadline_type: string | null;
  event_end_at: string | null;
  thumbnail_url: string | null;
  source_key: string | null;
  created_at: string | null;
  published_at: string | null;
  poster_status: string | null;
  source_institution_id: string | null;
  organizer_id: string | null;
};

const time = (value: string | null) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};

async function toItems(rows: Row[]): Promise<HomeItem<PlPosterCardData>[]> {
  const meta = (await fetchCategoryRegionNames(rows.map((row) => row.id)).catch(
    () => ({}),
  )) as Record<
    string,
    {
      categoryName?: string | null;
      categoryIds?: string[];
      regionIds?: string[];
    }
  >;
  return rows.map((row) => ({
    id: row.id,
    publishedAt: time(row.published_at) ?? time(row.created_at),
    institutionIds: [row.source_institution_id, row.organizer_id].filter(
      (id): id is string => Boolean(id),
    ),
    regionIds: meta[row.id]?.regionIds ?? [],
    categoryIds: meta[row.id]?.categoryIds ?? [],
    application: {
      applicationStartAt: row.application_start_at,
      applicationEndAt: row.application_end_at,
      deadlineType: row.deadline_type,
      posterStatus: row.poster_status,
      eventEndAt: row.event_end_at,
    },
    data: {
      id: row.id,
      title: row.title,
      org:
        (row.verification_status === "verified" && row.verified_at
          ? row.organizer_name || row.source_org_name
          : row.source_org_name) ?? undefined,
      applicationStartAt: row.application_start_at,
      deadline: row.application_end_at ?? undefined,
      deadlineType: row.deadline_type,
      eventEndAt: row.event_end_at,
      tags: meta[row.id]?.categoryName ? [meta[row.id].categoryName!] : [],
      image: row.thumbnail_url ?? undefined,
      sourceUrl: row.source_key ?? undefined,
      posterStatus: row.poster_status,
    },
  }));
}

const LATEST_LIMIT = 60;

type TaxonomyRows = {
  regions: RegionNode[];
  categories: Array<{
    id: string;
    code: string | null;
    parent_id: string | null;
  }>;
};

/** The region tree and the category list, read once per home load. */
async function loadTaxonomy(): Promise<TaxonomyRows> {
  const [regions, categories] = await Promise.all([
    supabase.from("regions").select("id, name, level, parent_id"),
    supabase.from("categories").select("id, code, parent_id"),
  ]);
  if (regions.error || categories.error) throw new Error("taxonomy");
  return {
    regions: (regions.data ?? []) as RegionNode[],
    categories: (categories.data ?? []) as TaxonomyRows["categories"],
  };
}

function searchOpen(
  categoryId: string | null,
  regionIds: string[] | null,
  limit: number,
) {
  return supabase
    .rpc("search_public_posters", {
      p_query: null,
      p_category_id: categoryId,
      p_region_ids: regionIds,
      p_include_closed: false,
      p_sort: "latest",
      p_limit: limit,
    })
    .select(SELECT)
    .then(({ data, error }) => ({
      data: (Array.isArray(data) ? data : []) as unknown as Row[],
      error,
    }));
}

/** Newest open posters with no conditions, for "최근 올라온 공고". */
async function loadLatestRows(): Promise<Row[]> {
  const result = await searchOpen(null, null, LATEST_LIMIT);
  if (result.error) throw new Error("latest posters");
  return result.data;
}

async function loadMemberSetup(userId: string) {
  const [profile, interests, favorites, follows] = await Promise.all([
    supabase
      .from("profiles")
      .select("primary_region_id, regions(id, name, full_name, level)")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_interest_categories")
      .select("category_id, categories(id, name)")
      .eq("user_id", userId),
    supabase
      .from("favorites")
      .select("poster_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("institution_follows")
      .select("institution_id, institutions(id, name, slug)")
      .eq("user_id", userId),
  ]);
  if (profile.error || interests.error || favorites.error || follows.error)
    throw new Error("member setup");
  const one = <V>(value: V | V[] | null | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null;
  const region = one(
    (profile.data as { regions?: unknown } | null)?.regions as {
      id: string;
      name: string;
      full_name: string | null;
      level: string;
    } | null,
  );
  return {
    interest: {
      region: region
        ? {
            id: region.id,
            name:
              region.level === "sigungu"
                ? region.name
                : region.full_name || region.name,
          }
        : null,
      categories: (
        (interests.data ?? []) as Array<{ categories: unknown }>
      ).flatMap((row) => {
        const category = one(
          row.categories as
            | { id: string; name: string }
            | { id: string; name: string }[]
            | null,
        );
        return category ? [category] : [];
      }),
    } satisfies HomeInterest,
    favoriteIds: (favorites.data ?? []).map((row) => row.poster_id as string),
    institutions: (
      (follows.data ?? []) as Array<{ institutions: unknown }>
    ).flatMap((row) => {
      const institution = one(
        row.institutions as
          | { id: string; name: string; slug: string }
          | { id: string; name: string; slug: string }[]
          | null,
      );
      return institution?.slug ? [institution] : [];
    }),
  };
}

async function loadRowsByIds(ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("posters")
    .select(SELECT)
    .in("id", ids)
    .in("poster_status", ["published", "closed"])
    .or(PUBLIC_POSTER_EXPOSURE_FILTER)
    .returns<Row[]>();
  if (error) throw new Error("favorite posters");
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

async function loadFollowedRows(institutionIds: string[]): Promise<Row[]> {
  if (institutionIds.length === 0) return [];
  const list = institutionIds.join(",");
  const { data, error } = await supabase
    .from("posters")
    .select(SELECT)
    .eq("poster_status", "published")
    .or(PUBLIC_POSTER_EXPOSURE_FILTER)
    .or(`source_institution_id.in.(${list}),organizer_id.in.(${list})`)
    .order("created_at", { ascending: false })
    .limit(40)
    .returns<Row[]>();
  if (error) throw new Error("followed posters");
  return data ?? [];
}

/**
 * The guest's conditions from this browser, with names from the database.
 * A region or category that no longer exists is left out.
 */
async function loadGuestInterest(): Promise<HomeInterest> {
  const stored = readGuestInterest(guestLocal);
  if (!stored) return { region: null, categories: [] };
  const [region, categories] = await Promise.all([
    stored.regionId
      ? supabase
          .from("regions")
          .select("id, name, full_name, level")
          .eq("id", stored.regionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    stored.categoryIds.length
      ? supabase
          .from("categories")
          .select("id, name")
          .in("id", stored.categoryIds)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (region.error || categories.error) throw new Error("guest interest");
  const row = region.data as {
    id: string;
    name: string;
    full_name: string | null;
    level: string;
  } | null;
  return {
    region: row
      ? {
          id: row.id,
          name: row.level === "sigungu" ? row.name : row.full_name || row.name,
        }
      : null,
    categories: (categories.data ?? []) as Array<{ id: string; name: string }>,
  };
}

/** Everything the home needs, for a member or for this browser's guest. */
export async function loadHomeData(): Promise<HomeData> {
  const userId =
    (await supabase.auth.getSession()).data.session?.user.id ?? null;
  const [setup, taxonomy] = await Promise.all([
    userId
      ? loadMemberSetup(userId)
      : loadGuestInterest().then((interest) => ({
          interest,
          favoriteIds: readGuestFavorites(guestLocal).map(
            (item) => item.posterId,
          ),
          institutions: [] as Array<{ id: string; name: string; slug: string }>,
        })),
    loadTaxonomy(),
  ]);
  const categoryScopes = Object.fromEntries(
    setup.interest.categories.map((category) => [
      category.id,
      categoryScopeIds(category.id, taxonomy.categories),
    ]),
  );
  const searchedCategoryIds = Array.from(
    new Set(Object.values(categoryScopes).flat()),
  );
  const institutionIds = setup.institutions.map((item) => item.id);
  const [interestRows, nearbyRows, latestRows, favoriteRows, followedRows] =
    await Promise.all([
      searchInterestGroups({
        regionId: setup.interest.region?.id ?? null,
        regions: taxonomy.regions,
        categoryIds: searchedCategoryIds,
        search: searchOpen,
      }),
      searchNearby({
        regionId: setup.interest.region?.id ?? null,
        regions: taxonomy.regions,
        categoryIds: searchedCategoryIds,
        search: searchOpen,
      }),
      loadLatestRows(),
      loadRowsByIds(setup.favoriteIds),
      loadFollowedRows(institutionIds),
    ]);
  const [
    interestItems,
    nearbyItems,
    latestItems,
    favoriteItems,
    followedItems,
  ] = await Promise.all([
    toItems(interestRows),
    toItems(nearbyRows),
    toItems(latestRows),
    toItems(favoriteRows),
    toItems(followedRows),
  ]);
  return {
    signedIn: Boolean(userId),
    interest: setup.interest,
    interestItems,
    nearbyItems,
    latestItems,
    favoriteItems,
    followedItems,
    institutions: setup.institutions,
    regions: taxonomy.regions,
    categoryScopes,
  };
}
