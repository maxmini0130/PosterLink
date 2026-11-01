/**
 * One search over a main category and the content types folded into it
 * (categoryTaxonomy.ts), shared by the server's first render of 공고 찾기,
 * the category/region landings and the client's own searches, so the same URL
 * gives the same posters whichever way the page was reached.
 */

export type ScopedSearchRow = {
  id: string;
  created_at?: string | null;
  application_end_at?: string | null;
};

type RpcResult<R> = { data: R[] | null; error: unknown };

/** Rows per category call; enough that one category rarely fills it. */
export const SCOPED_CATEGORY_LIMIT = 500;

const time = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Same order as search_public_posters: by deadline (no date last) for
 * "deadline", otherwise newest first; ties newest first.
 */
export function sortLikeSearch<R extends ScopedSearchRow>(
  rows: R[],
  sort: "deadline" | "latest",
) {
  const created = (row: R) => time(row.created_at) ?? -Infinity;
  return [...rows].sort((a, b) => {
    if (sort === "deadline") {
      const ea = time(a.application_end_at);
      const eb = time(b.application_end_at);
      if (ea !== eb) {
        if (ea === null) return 1;
        if (eb === null) return -1;
        return ea - eb;
      }
    }
    return created(b) - created(a);
  });
}

/**
 * Runs `search` once per category id (or once with null) and returns the
 * posters once each in search order, cut to `limit`. `total` counts them
 * before the cut; `exact` is true when no category call was cut at its own
 * limit, so `total` is the full count.
 */
export async function searchCategoryScope<R extends ScopedSearchRow>({
  categoryIds,
  sort,
  limit,
  search,
}: {
  categoryIds: string[];
  sort: "deadline" | "latest";
  limit: number;
  search: (
    categoryId: string | null,
    limit: number,
  ) => PromiseLike<RpcResult<R>>;
}): Promise<{ rows: R[]; total: number; error: unknown; exact: boolean }> {
  const ids: Array<string | null> = categoryIds.length ? categoryIds : [null];
  const perCall = ids.length > 1 ? SCOPED_CATEGORY_LIMIT : limit;
  const results = await Promise.all(ids.map((id) => search(id, perCall)));
  const failed = results.find((result) => result.error);
  if (failed) return { rows: [], total: 0, error: failed.error, exact: false };
  const seen = new Set<string>();
  const merged: R[] = [];
  for (const result of results)
    for (const row of result.data ?? [])
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
  const exact = results.every((result) => (result.data ?? []).length < perCall);
  const ordered = ids.length > 1 ? sortLikeSearch(merged, sort) : merged;
  return {
    rows: ordered.slice(0, limit),
    total: ordered.length,
    error: null,
    exact,
  };
}

type SearchRpcClient = {
  rpc: (
    fn: "search_public_posters",
    args: Record<string, unknown>,
  ) => {
    select: (columns: string) => PromiseLike<{
      data: unknown;
      error: unknown;
    }>;
  };
};

/**
 * search_public_posters over the category scope of `categoryId` within
 * `categories` (a main category with its folded content types).
 */
export function searchPublicPostersInScope<R extends ScopedSearchRow>(
  client: SearchRpcClient,
  {
    categoryIds,
    query,
    regionIds,
    includeClosed,
    sort,
    limit,
    select,
  }: {
    categoryIds: string[];
    query: string | null;
    regionIds: string[] | null;
    includeClosed: boolean;
    sort: "deadline" | "latest";
    limit: number;
    select: string;
  },
) {
  return searchCategoryScope<R>({
    categoryIds,
    sort,
    limit,
    search: (categoryId, callLimit) =>
      client
        .rpc("search_public_posters", {
          p_query: query,
          p_category_id: categoryId,
          p_region_ids: regionIds,
          p_include_closed: includeClosed,
          p_sort: sort,
          p_limit: callLimit,
        })
        .select(select)
        .then(({ data, error }) => ({
          data: (Array.isArray(data) ? data : []) as R[],
          error,
        })),
  });
}
