import type { KeyValueStore } from "./guestStore";
import { getRegionScopeIds } from "./regionHelpers";

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

/** What a browsed region shows when it has no posters of its own. */
export type BrowseFallback = "sido" | "nation";

/**
 * Which posters a browsed region shows (SPEC 7.1: list, count and chips).
 *
 * - Nothing chosen, or the default 시·도 (서울 전체): posters linked to 서울, its
 *   구·군 or 전국, plus posters with no region link yet.
 * - 전국: every poster.
 * - A 시·도: posters linked to it, its 구·군 or 전국.
 * - A 구·군: posters linked to it, to its 시·도 or to 전국. A poster linked to
 *   another 구 *and* to 서울 stays in: the 서울 link means anyone in 서울 can
 *   apply.
 * - Residents of some 구 only (`onlyIds`: 구 links whose basis is
 *   'eligibility', SPEC 8): such a poster shows in those 구 and in 서울 전체
 *   (with "○○구 주민만 신청 가능"), never in another 구.
 * - A region with no posters of its own still lists the wider ones and says so
 *   (`fallback`): a 시·도 shows nationwide posters, a 구 its 시·도 and 전국.
 */
export function browsePosterScope<
  P extends { id: string; regionIds: string[]; onlyIds?: string[] },
>(input: {
  chosen: RegionLike | null;
  defaultSidoId: string | null;
  regions: RegionLike[];
  posters: P[];
}): { posters: P[]; fallback: BrowseFallback | null } {
  const { chosen, regions, posters } = input;
  const levelOf = new Map(regions.map((r) => [r.id, r.level ?? null]));
  const isNation = (id: string) => levelOf.get(id) === "nation";
  if (chosen?.level === "nation") return { posters, fallback: null };
  // Choosing "서울 전체" is the same view as choosing nothing.
  if (!chosen || chosen.id === input.defaultSidoId) {
    const scope = getRegionScopeIds(input.defaultSidoId, regions);
    return {
      posters: posters.filter(
        (p) =>
          !scope ||
          !p.regionIds.length ||
          p.regionIds.some((id) => scope.has(id)),
      ),
      fallback: null,
    };
  }
  const own = new Set([
    chosen.id,
    ...regions.filter((r) => r.parent_id === chosen.id).map((r) => r.id),
  ]);
  const hasOwn = posters.some((p) => p.regionIds.some((id) => own.has(id)));
  if (chosen.level !== "sigungu" && !hasOwn)
    return {
      posters: posters.filter((p) => p.regionIds.some(isNation)),
      fallback: "nation",
    };
  const scope = getRegionScopeIds(chosen.id, regions) ?? new Set<string>();
  return {
    posters: posters.filter((p) =>
      chosen.level === "sigungu" && p.onlyIds?.length
        ? p.onlyIds.includes(chosen.id)
        : p.regionIds.some((id) => scope.has(id)),
    ),
    fallback: hasOwn ? null : "sido",
  };
}

/**
 * A poster's region condition (SPEC 8, 7.2). `text` is the full wording (the
 * detail), `short` the card wording, which is never cut off:
 * - 거주만:        "성동구 주민만 신청 가능" / "성동구 주민만"
 * - 거주·생활권:   "성동구 거주·생활권만 신청 가능" / "성동구 거주·생활권만"
 * - not decided:   "성동구 한정 · 세부 자격은 원문 확인" / "성동구 한정"
 * - 우대:          "[우대] 마포구·서대문구 거주·생활권" / "마포·서대문 생활권 우대"
 */
export type RegionCondition = {
  kind: "only" | "preferred";
  text: string;
  short: string;
};

const GU_NAME = /^[가-힣]{1,4}구$/;

/** "성동구"; two or more: "마포·서대문" (a one-syllable 구 such as 중구 stays whole). */
function shortGuNames(names: string[]) {
  if (names.length === 1) return names[0];
  return names
    .map((name) => (name.length > 2 ? name.replace(/구$/, "") : name))
    .join("·");
}

/**
 * The region condition a card or the detail shows.
 * - only: the poster's 구 links with basis 'eligibility'. Who that lets in
 *   comes from the recorded crawler decision (field_verification.cardFacts.
 *   regionEligibility.residency): 거주만 or 거주·생활권. Without one, or when
 *   it is unclear, only the 구 limit is stated. Not repeated while browsing
 *   that very 구.
 * - preferred: the recorded decision of kind gu_preferred, with the preferred
 *   구 named.
 * Nothing is guessed: without data there is no condition.
 */
export function posterRegionCondition(input: {
  onlyNames: string[];
  eligibility?: { kind?: unknown; gus?: unknown; residency?: unknown } | null;
  browsingGuName?: string | null;
}): RegionCondition | null {
  const decision = input.eligibility;
  const only = [...new Set(input.onlyNames.filter(Boolean))];
  if (only.length) {
    if (input.browsingGuName && only.includes(input.browsingGuName))
      return null;
    const full = only.join("·");
    const short = shortGuNames(only);
    const residency =
      decision?.kind === "gu_restricted" ? decision.residency : null;
    if (residency === "resident")
      return {
        kind: "only",
        text: `${full} 주민만 신청 가능`,
        short: `${short} 주민만`,
      };
    if (residency === "life_area")
      return {
        kind: "only",
        text: `${full} 거주·생활권만 신청 가능`,
        short: `${short} 거주·생활권만`,
      };
    return {
      kind: "only",
      text: `${full} 한정 · 세부 자격은 원문 확인`,
      short: `${short} 한정`,
    };
  }
  const gus = Array.isArray(decision?.gus)
    ? decision.gus.filter(
        (name): name is string =>
          typeof name === "string" && GU_NAME.test(name),
      )
    : [];
  if (decision?.kind === "gu_preferred" && gus.length)
    return {
      kind: "preferred",
      text: `${gus.join("·")} 거주·생활권`,
      short: `${shortGuNames(gus)} 생활권 우대`,
    };
  return null;
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
