import type { KeyValueStore } from "./guestStore";

/**
 * The region the home is browsed in ("둘러보는 지역", docs/design/v6.1/SPEC.md
 * 8 '지역과 신청 자격'). It is not where the person lives: choosing one never
 * changes the profile region or a guest's interest conditions. It is kept in
 * this browser per owner, so a member's choice does not leak to a guest (or
 * another account) using the same browser. Pure functions over injected stores.
 */

export const BROWSE_REGION_KEY = "pl.browse_region.v1";
/** Fired on window after a choice is stored, so other mounted screens follow. */
export const BROWSE_REGION_EVENT = "pl:browse-region";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OWNERS = 5;

export type BrowseRegion = { regionId: string; label: string };

type Stored = { regionId: string; label: string; at: number };

/** "guest" for visitors, "user:<id>" for members. */
export function browseRegionOwner(userId: string | null | undefined) {
  return userId ? `user:${userId}` : "guest";
}

function readAll(store: KeyValueStore): Record<string, Stored> {
  try {
    const value = JSON.parse(store.getItem(BROWSE_REGION_KEY) || "null") as {
      v?: unknown;
      owners?: unknown;
    } | null;
    if (!value || value.v !== 1 || typeof value.owners !== "object") return {};
    const out: Record<string, Stored> = {};
    for (const [owner, raw] of Object.entries(
      (value.owners ?? {}) as Record<string, unknown>,
    )) {
      const item = raw as Partial<Stored> | null;
      if (
        item &&
        typeof item.regionId === "string" &&
        UUID.test(item.regionId) &&
        typeof item.label === "string" &&
        item.label.trim() &&
        item.label.length <= 40
      )
        out[owner] = {
          regionId: item.regionId,
          label: item.label,
          at: typeof item.at === "number" ? item.at : 0,
        };
    }
    return out;
  } catch {
    return {};
  }
}

/** The owner's last browsed region, or null when they have not chosen one. */
export function readBrowseRegion(
  store: KeyValueStore,
  owner: string,
): BrowseRegion | null {
  const item = readAll(store)[owner];
  return item ? { regionId: item.regionId, label: item.label } : null;
}

/** Stores the choice; false when the browser would not keep it. */
export function saveBrowseRegion(
  store: KeyValueStore,
  owner: string,
  region: BrowseRegion,
  now: number,
) {
  if (!UUID.test(region.regionId) || !region.label.trim()) return false;
  const owners = readAll(store);
  owners[owner] = { regionId: region.regionId, label: region.label, at: now };
  // Keep the few most recent owners only.
  const kept = Object.entries(owners)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_OWNERS);
  try {
    store.setItem(
      BROWSE_REGION_KEY,
      JSON.stringify({ v: 1, owners: Object.fromEntries(kept) }),
    );
    return true;
  } catch {
    return false;
  }
}

const TWO_PART_PROVINCES: Record<string, string> = {
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
};

/** 서울특별시 → 서울, 경기도 → 경기, 세종특별자치시 → 세종, 충청북도 → 충북. */
export function shortSidoName(name: string) {
  const trimmed = name.trim();
  if (TWO_PART_PROVINCES[trimmed]) return TWO_PART_PROVINCES[trimmed];
  const short = trimmed.replace(
    /(특별자치시|특별자치도|특별시|광역시|도)$/,
    "",
  );
  return short || trimmed;
}

export type RegionLike = {
  id: string;
  name: string;
  level?: string | null;
  parent_id?: string | null;
};

/** Title for the home: "서울 전체", "서울 마포구", "전국". */
export function browseRegionLabel(
  region: RegionLike | null | undefined,
  parent?: RegionLike | null,
) {
  if (!region) return null;
  if (region.level === "nation") return "전국";
  if (region.level === "sigungu")
    return parent
      ? `${shortSidoName(parent.name)} ${region.name}`
      : region.name;
  return `${shortSidoName(region.name)} 전체`;
}

/**
 * Whether a poster belongs to the browsed 구·군. `district` is that 구 with
 * its 시·도 and 전국 (regionHelpers.getRegionScopeIds). A poster is judged by
 * its most specific links: one linked to 강북구 (and to 서울 as well) belongs to
 * 강북구 only; one linked to 서울 or 전국 alone belongs to every 구. A poster
 * with no region links is left out of a 구 view.
 */
export function inBrowsedDistrict(
  linkedIds: string[],
  levelOf: (id: string) => string | null | undefined,
  district: Set<string>,
) {
  const districts = linkedIds.filter((id) => levelOf(id) === "sigungu");
  return (districts.length ? districts : linkedIds).some((id) =>
    district.has(id),
  );
}

/**
 * Short region tag for a poster (detail "유형 / 지역 / 접수 상태"): the most
 * specific places it is linked to, e.g. "마포구", "금천구 외 1곳", "서울", "전국".
 */
export function posterRegionTag(regions: RegionLike[]) {
  const unique = (list: string[]) => [...new Set(list)];
  const districts = unique(
    regions.filter((r) => r.level === "sigungu").map((r) => r.name),
  );
  if (districts.length)
    return districts.length === 1
      ? districts[0]
      : `${districts[0]} 외 ${districts.length - 1}곳`;
  const cities = unique(
    regions.filter((r) => r.level === "sido").map((r) => shortSidoName(r.name)),
  );
  if (cities.length)
    return cities.length === 1
      ? cities[0]
      : `${cities[0]} 외 ${cities.length - 1}곳`;
  return regions.some((r) => r.level === "nation") ? "전국" : null;
}
