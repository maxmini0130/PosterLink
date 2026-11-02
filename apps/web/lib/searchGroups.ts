/**
 * Search results in separate groups (UI redesign ⑪, retention plan 1-2).
 * The region filter also returns posters for the wider areas that contain the
 * chosen region (all of Seoul, the whole country). Those are listed apart,
 * each with its scope, and never mixed into "선택한 조건에 맞는 공고".
 * Nearby districts need an adjacency table that does not exist yet, so that
 * group is not produced.
 */
import type { KeyValueStore } from "./guestStore";

export type RegionNode = {
  id: string;
  name: string;
  level: string;
  parent_id?: string | null;
};

export type WiderScope = { regionId: string; label: string; nation: boolean };

export type SearchGroups<T> = {
  matched: T[];
  wider: Array<{ item: T; scope: WiderScope }>;
};

/** "서울 전체" / "전국" for a containing region. */
function scopeOf(region: RegionNode): WiderScope {
  if (region.level === "nation")
    return { regionId: region.id, label: "전국", nation: true };
  const short = region.name.replace(
    /(특별시|광역시|특별자치시|특별자치도|도)$/,
    "",
  );
  return { regionId: region.id, label: `${short} 전체`, nation: false };
}

export function groupByRegionScope<T>(
  items: T[],
  regionIds: (item: T) => string[] | undefined,
  selectedRegionId: string | null,
  regions: RegionNode[],
): SearchGroups<T> {
  const selected = regions.find((region) => region.id === selectedRegionId);
  if (!selected || selected.level === "nation")
    return { matched: items, wider: [] };

  const own = new Set([selected.id]);
  for (const region of regions)
    if (region.parent_id === selected.id) own.add(region.id);
  const ancestors: RegionNode[] = [];
  let parentId = selected.parent_id ?? null;
  while (parentId && !own.has(parentId)) {
    const parent = regions.find((region) => region.id === parentId);
    if (!parent) break;
    ancestors.push(parent);
    parentId = parent.parent_id ?? null;
  }
  // 전국 is the widest scope even without a parent link from the 시·도.
  for (const region of regions)
    if (
      region.level === "nation" &&
      !own.has(region.id) &&
      !ancestors.some((ancestor) => ancestor.id === region.id)
    )
      ancestors.push(region);

  const matched: T[] = [];
  const wider: SearchGroups<T>["wider"] = [];
  for (const item of items) {
    const ids = regionIds(item) ?? [];
    if (ids.some((id) => own.has(id))) {
      matched.push(item);
      continue;
    }
    // The narrowest containing region the poster names (서울 before 전국).
    const container = ancestors.find((ancestor) => ids.includes(ancestor.id));
    if (container) wider.push({ item, scope: scopeOf(container) });
    else matched.push(item); // no region link: keep what the filter returned
  }
  // 서울 전체 first, then 전국.
  wider.sort((a, b) => Number(a.scope.nation) - Number(b.scope.nation));
  return { matched, wider };
}

// ------------------------------------------------------------ saved filters

export const SAVED_SEARCHES_KEY = "pl.saved_searches.v1";
export const SAVED_SEARCHES_MAX = 5;

export type SavedSearch = {
  regionId: string | null;
  categoryId: string | null;
  savedAt: number;
};

const sameCondition = (
  a: Pick<SavedSearch, "regionId" | "categoryId">,
  b: Pick<SavedSearch, "regionId" | "categoryId">,
) => a.regionId === b.regionId && a.categoryId === b.categoryId;

export function readSavedSearches(store: KeyValueStore): SavedSearch[] {
  try {
    const value = JSON.parse(store.getItem(SAVED_SEARCHES_KEY) ?? "null") as {
      v?: unknown;
      items?: unknown;
    } | null;
    if (value?.v !== 1 || !Array.isArray(value.items)) return [];
    const items: SavedSearch[] = [];
    for (const raw of value.items as Array<Partial<SavedSearch>>) {
      const item = {
        regionId: typeof raw?.regionId === "string" ? raw.regionId : null,
        categoryId: typeof raw?.categoryId === "string" ? raw.categoryId : null,
        savedAt: typeof raw?.savedAt === "number" ? raw.savedAt : 0,
      };
      if (!item.regionId && !item.categoryId) continue;
      if (items.some((other) => sameCondition(other, item))) continue;
      items.push(item);
    }
    return items.slice(0, SAVED_SEARCHES_MAX);
  } catch {
    return [];
  }
}

function writeSavedSearches(store: KeyValueStore, items: SavedSearch[]) {
  try {
    store.setItem(SAVED_SEARCHES_KEY, JSON.stringify({ v: 1, items }));
    return true;
  } catch {
    return false;
  }
}

/** Saves a region/category pair, newest first; false if the browser refuses. */
export function saveSearch(
  store: KeyValueStore,
  condition: Pick<SavedSearch, "regionId" | "categoryId">,
  now: number,
) {
  if (!condition.regionId && !condition.categoryId) return false;
  const rest = readSavedSearches(store).filter(
    (item) => !sameCondition(item, condition),
  );
  return writeSavedSearches(
    store,
    [{ ...condition, savedAt: now }, ...rest].slice(0, SAVED_SEARCHES_MAX),
  );
}

export function removeSavedSearch(
  store: KeyValueStore,
  condition: Pick<SavedSearch, "regionId" | "categoryId">,
) {
  writeSavedSearches(
    store,
    readSavedSearches(store).filter((item) => !sameCondition(item, condition)),
  );
}

export function isSavedSearch(
  items: SavedSearch[],
  condition: Pick<SavedSearch, "regionId" | "categoryId">,
) {
  return items.some((item) => sameCondition(item, condition));
}
