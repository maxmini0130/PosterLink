import type { SupabaseClient } from "@supabase/supabase-js";

/** One RPC contract for home, search and regional counts. RLS remains enforced. */
export function publicPosterQuery(
  filters: {
    query?: string | null;
    categoryId?: string | null;
    regionIds?: string[] | null;
    includeClosed?: boolean;
  } = {},
) {
  return {
    p_query: filters.query || null,
    p_category_id: filters.categoryId || null,
    p_region_ids: filters.regionIds ?? null,
    p_include_closed: Boolean(filters.includeClosed),
  };
}

export async function countOpenPosters(
  client: SupabaseClient,
  filters: Parameters<typeof publicPosterQuery>[0] = {},
) {
  const { data, error } = await client.rpc(
    "count_public_posters",
    publicPosterQuery(filters),
  );
  if (error) throw error;
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0)
    throw new Error("Invalid public poster count");
  return data;
}

export function posterListCounts(
  total: number,
  loaded: number,
  requestedVisible: number,
) {
  const visible = Math.min(loaded, requestedVisible);
  return {
    visible,
    loadedRemaining: Math.max(0, loaded - visible),
    remaining: Math.max(0, total - visible),
    unloaded: Math.max(0, total - loaded),
  };
}
