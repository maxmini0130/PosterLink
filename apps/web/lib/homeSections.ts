/**
 * Which home sections to show (screen plan v1.0, 03·04 홈; retention plan
 * 3-3). Every status comes from getDeadlineDisplay; empty sections are left
 * out so the screen never shows empty boxes, and a poster is shown once.
 *
 * Order of work (09 "추천 목록 처리 순서"): public and open only -> the
 * interest region and categories -> one entry per poster -> newest first ->
 * one group per region scope (my area, 서울·전국 대상, other areas nearby).
 */
import {
  getDeadlineDisplay,
  isClosingWithinDays,
  type DeadlineDisplay,
} from "./deadlineDisplay";
import type { PosterApplicationInput } from "./posterApplication";
import {
  groupByRegionScope,
  type RegionNode,
  type WiderScope,
} from "./searchGroups";

export type HomeItem<T> = {
  id: string;
  /** When the poster became public (published_at, else created_at); ms. */
  publishedAt: number | null;
  /** Institutions the poster belongs to (source or organiser). */
  institutionIds: string[];
  /** Regions the poster is for (poster_regions). */
  regionIds?: string[];
  /** Categories the poster carries (poster_categories). */
  categoryIds?: string[];
  application: PosterApplicationInput;
  data: T;
};

export type HomeEntry<T> = HomeItem<T> & {
  display: DeadlineDisplay;
  favorite: boolean;
};

export type HomeState = "first" | "new" | "quiet";

export type HomeSections<T> = {
  state: HomeState;
  /**
   * The main grid: new interest posters in my area since the last visit
   * ("fresh"), otherwise open interest posters in my area ("open").
   */
  primary: HomeEntry<T>[];
  primaryKind: "fresh" | "open";
  /** Open interest posters for 서울 전체 or 전국, each with its scope. */
  wider: Array<{ entry: HomeEntry<T>; scope: WiderScope }>;
  /** Open interest posters for other districts of the same 시·도. */
  nearby: HomeEntry<T>[];
  /** Trusted deadlines within 7 days not already in the first grid page. */
  closingSoon: HomeEntry<T>[];
  /** Favorites whose reception started since the baseline. */
  startedFavorites: HomeEntry<T>[];
  /** New posters since the baseline from followed institutions. */
  followedNews: Array<{ institutionId: string; items: HomeEntry<T>[] }>;
  /** No favorites and no follows: one line pointing to institutions. */
  followGuide: boolean;
  /** Newest open posters with no condition, when there is nothing else. */
  latest: HomeEntry<T>[];
};

/** Cards in the first grid page; "더 보기" adds the same number. */
export const HOME_PAGE_SIZE = 6;
export const WIDER_SHOWN = 6;
export const NEARBY_SHOWN = 4;
export const CLOSING_SHOWN = 4;
export const LATEST_SHOWN = 6;

/** A start date without a time begins at 00:00 in Asia/Seoul. */
function startTime(value?: string | null) {
  if (!value) return Number.NaN;
  return Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value,
  );
}

/** Open now: dated, 상시 or 소진 시. Unconfirmed schedules are not claimed open. */
const isOpen = (display: DeadlineDisplay) =>
  display.reception === "open" ||
  display.reception === "ongoing" ||
  display.reception === "until_exhausted";

const newestFirst = <E extends { publishedAt: number | null }>(a: E, b: E) =>
  (b.publishedAt ?? 0) - (a.publishedAt ?? 0);

export function buildHomeSections<T>(input: {
  interest: HomeItem<T>[];
  favorites: HomeItem<T>[];
  followed: HomeItem<T>[];
  /** Open posters for other districts of the chosen 시·도. */
  nearby?: HomeItem<T>[];
  latest?: HomeItem<T>[];
  followedInstitutionIds: string[];
  /** The chosen region and the region tree; no region keeps one group. */
  region?: { selectedId: string | null; regions: RegionNode[] };
  /** Without conditions the newest posters are the home's content. */
  hasInterest?: boolean;
  baselineAt: number | null;
  now: Date;
}): HomeSections<T> {
  const favoriteIds = new Set(input.favorites.map((item) => item.id));
  const entry = (item: HomeItem<T>): HomeEntry<T> => ({
    ...item,
    display: getDeadlineDisplay({ ...item.application, now: input.now }),
    favorite: favoriteIds.has(item.id),
  });
  const unique = <I extends HomeItem<T>>(items: I[]) => {
    const seen = new Set<string>();
    return items.filter((item) =>
      seen.has(item.id) ? false : (seen.add(item.id), true),
    );
  };
  const interest = unique(input.interest).map(entry);
  const favorites = unique(input.favorites).map(entry);
  const followed = unique(input.followed).map(entry);
  const baseline = input.baselineAt;
  const isNew = (item: HomeEntry<T>) =>
    baseline !== null &&
    item.publishedAt !== null &&
    item.publishedAt > baseline &&
    item.display.reception !== "closed";

  const open = interest
    .filter((item) => isOpen(item.display))
    .sort(newestFirst);
  const { matched: own, wider } = groupByRegionScope(
    open,
    (item) => item.regionIds,
    input.region?.selectedId ?? null,
    input.region?.regions ?? [],
  );
  const fresh = own.filter(isNew);
  const state: HomeState =
    baseline === null ? "first" : fresh.length > 0 ? "new" : "quiet";
  const primary = state === "new" ? fresh : own;

  const shown = new Set<string>([
    ...primary.map((item) => item.id),
    ...wider.map(({ item }) => item.id),
  ]);
  const nearby = unique(input.nearby ?? [])
    .map(entry)
    .filter((item) => isOpen(item.display) && !shown.has(item.id))
    .sort(newestFirst)
    .slice(0, NEARBY_SHOWN);
  for (const item of nearby) shown.add(item.id);

  // The first grid page and the wider group are already on screen; the side
  // list adds others (screen plan 03: keep repeats to a minimum).
  const firstPage = new Set([
    ...primary.slice(0, HOME_PAGE_SIZE).map((item) => item.id),
    ...wider.slice(0, WIDER_SHOWN).map(({ item }) => item.id),
  ]);
  const closingSoon = unique([...favorites, ...interest, ...followed])
    .filter(
      (item) => isClosingWithinDays(item.display) && !firstPage.has(item.id),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (a.display.daysLeft ?? 0) - (b.display.daysLeft ?? 0),
    )
    .slice(0, CLOSING_SHOWN);

  const startedFavorites =
    baseline === null
      ? []
      : favorites.filter((item) => {
          const start = startTime(item.application.applicationStartAt);
          return (
            !Number.isNaN(start) &&
            start > baseline &&
            start <= input.now.getTime() &&
            isOpen(item.display)
          );
        });

  const followedNews = input.followedInstitutionIds
    .map((institutionId) => ({
      institutionId,
      items: followed
        .filter(
          (item) => item.institutionIds.includes(institutionId) && isNew(item),
        )
        .sort(newestFirst),
    }))
    .filter((group) => group.items.length > 0);

  const nothingMatched = primary.length === 0 && wider.length === 0;
  const latest =
    input.hasInterest === false || nothingMatched
      ? unique(input.latest ?? [])
          .map(entry)
          .filter((item) => isOpen(item.display) && !shown.has(item.id))
          .slice(0, LATEST_SHOWN)
      : [];

  return {
    state,
    primary,
    primaryKind: state === "new" ? "fresh" : "open",
    wider: wider
      .slice(0, WIDER_SHOWN)
      .map(({ item, scope }) => ({ entry: item, scope })),
    nearby,
    closingSoon,
    startedFavorites,
    followedNews,
    followGuide:
      favorites.length === 0 && input.followedInstitutionIds.length === 0,
    latest,
  };
}

/** "10월 28일(수)" in Asia/Seoul. */
export function visitDateLabel(time: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}월 ${parts.day}일(${parts.weekday})`;
}
