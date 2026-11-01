/**
 * Which open-poster searches the home runs (screen plan v1.0, 03·04 and 09
 * "추천 목록 처리 순서"). Each region group is searched on its own, with its own
 * limit, so newer 전국 posters can never push the chosen area's posters out
 * of a shared limit before the groups are split.
 */
import { getRegionScopeIds } from "./regionHelpers";
import type { RegionNode } from "./searchGroups";

export type OpenSearch<R> = (
  categoryId: string | null,
  regionIds: string[] | null,
  limit: number,
) => PromiseLike<{ data: R[] | null; error: unknown }>;

/** Per category and region group. */
export const OWN_LIMIT = 120;
export const WIDER_LIMIT = 40;
export const NEARBY_LIMIT = 20;

/**
 * The chosen region with the districts inside it ("my area"), and the areas
 * above it (시·도, 전국) as a separate group.
 */
export function splitRegionScope(regionId: string, regions: RegionNode[]) {
  const scope = getRegionScopeIds(regionId, regions);
  if (!scope) return { own: null, wider: [] as string[] };
  const own = [regionId];
  for (const region of regions)
    if (region.parent_id === regionId) own.push(region.id);
  const ownSet = new Set(own);
  return { own, wider: [...scope].filter((id) => !ownSet.has(id)) };
}

async function runAll<R extends { id: string }>(
  calls: Array<PromiseLike<{ data: R[] | null; error: unknown }>>,
  what: string,
) {
  const results = await Promise.all(calls);
  if (results.some((result) => result.error)) throw new Error(what);
  const seen = new Set<string>();
  return results
    .flatMap((result) => result.data ?? [])
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

/** Open interest posters: my area and the wider areas, each searched apart. */
export function searchInterestGroups<R extends { id: string }>({
  regionId,
  regions,
  categoryIds,
  search,
}: {
  regionId: string | null;
  regions: RegionNode[];
  categoryIds: string[];
  search: OpenSearch<R>;
}) {
  const categories = categoryIds.length ? categoryIds : [null];
  if (!regionId)
    return runAll(
      categories.map((id) => search(id, null, OWN_LIMIT)),
      "interest posters",
    );
  const { own, wider } = splitRegionScope(regionId, regions);
  if (!own)
    return runAll(
      categories.map((id) => search(id, null, OWN_LIMIT)),
      "interest posters",
    );
  return runAll(
    [
      ...categories.map((id) => search(id, own, OWN_LIMIT)),
      ...(wider.length
        ? categories.map((id) => search(id, wider, WIDER_LIMIT))
        : []),
    ],
    "interest posters",
  );
}

/**
 * Open posters for the other districts of the chosen district's 시·도, in the
 * chosen categories (searched with the category, not filtered afterwards).
 */
export function searchNearby<R extends { id: string }>({
  regionId,
  regions,
  categoryIds,
  search,
}: {
  regionId: string | null;
  regions: RegionNode[];
  categoryIds: string[];
  search: OpenSearch<R>;
}) {
  const chosen = regions.find((region) => region.id === regionId);
  if (!chosen || chosen.level !== "sigungu" || !chosen.parent_id)
    return Promise.resolve([] as R[]);
  const siblings = regions
    .filter(
      (region) =>
        region.parent_id === chosen.parent_id && region.id !== chosen.id,
    )
    .map((region) => region.id);
  if (siblings.length === 0) return Promise.resolve([] as R[]);
  const categories = categoryIds.length ? categoryIds : [null];
  return runAll(
    categories.map((id) => search(id, siblings, NEARBY_LIMIT)),
    "nearby posters",
  );
}
