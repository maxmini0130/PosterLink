"use client";

import { readGuestInterest } from "../../lib/guestInterest";
import { readGuestFavorites } from "../../lib/guestStore";
import { guestLocal } from "./guestSession";
import { supabase } from "./supabase";

/**
 * Who is looking at the home and with which conditions. The sections
 * themselves come from the server (lib/homeFeedServer); the browser only
 * knows the session, this browser's guest conditions and saved posters.
 */

/** Interest conditions shown on the home button and used for the lists. */
export type HomeInterest = {
  region: { id: string; name: string } | null;
  categories: Array<{ id: string; name: string }>;
};

export type HomeConditions = {
  signedIn: boolean;
  /** The member's id (owner of the browsed region); null for guests. */
  userId: string | null;
  /** Profile region (members) or interest region (guests): the browsing default. */
  interest: HomeInterest;
  favoriteIds: string[];
  institutions: Array<{ id: string; name: string; slug: string }>;
};

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

/** The session's member conditions, or this browser's guest conditions. */
export async function loadHomeConditions(): Promise<HomeConditions> {
  const userId =
    (await supabase.auth.getSession()).data.session?.user.id ?? null;
  if (userId)
    return { signedIn: true, userId, ...(await loadMemberSetup(userId)) };
  return {
    signedIn: false,
    userId: null,
    interest: await loadGuestInterest(),
    favoriteIds: readGuestFavorites(guestLocal).map((item) => item.posterId),
    institutions: [],
  };
}
