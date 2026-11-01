/**
 * Which home sections to show (UI redesign ⑥⑦⑧, retention plan 3-3). Every
 * status comes from getDeadlineDisplay; empty sections are left out so the
 * screen never shows several empty boxes.
 */
import {
  getDeadlineDisplay,
  isClosingWithinDays,
  type DeadlineDisplay,
} from "./deadlineDisplay";
import type { PosterApplicationInput } from "./posterApplication";

export type HomeItem<T> = {
  id: string;
  /** When the poster became public (published_at, else created_at); ms. */
  publishedAt: number | null;
  /** Institutions the poster belongs to (source or organiser). */
  institutionIds: string[];
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
  /** First visit, or the fallback when a return visit has nothing else. */
  openInterest: HomeEntry<T>[];
  /** New interest posters since the baseline, newest first. */
  fresh: HomeEntry<T>[];
  /** Trusted deadlines within 7 days; favorites first, then soonest. */
  closingSoon: HomeEntry<T>[];
  /** Favorites whose reception started since the baseline. */
  startedFavorites: HomeEntry<T>[];
  /** New posters since the baseline from followed institutions. */
  followedNews: Array<{ institutionId: string; items: HomeEntry<T>[] }>;
  /** Return visit with no favorites and no follows: one guide card. */
  followGuide: boolean;
};

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

export function buildHomeSections<T>(input: {
  interest: HomeItem<T>[];
  favorites: HomeItem<T>[];
  followed: HomeItem<T>[];
  followedInstitutionIds: string[];
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

  const openInterest = interest.filter((item) => isOpen(item.display));
  const fresh = interest
    .filter(isNew)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

  const closingSoon = unique([...favorites, ...interest, ...followed])
    .filter((item) => isClosingWithinDays(item.display))
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (a.display.daysLeft ?? 0) - (b.display.daysLeft ?? 0),
    );

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
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
    }))
    .filter((group) => group.items.length > 0);

  if (baseline === null)
    return {
      state: "first",
      openInterest,
      fresh: [],
      closingSoon: [],
      startedFavorites: [],
      followedNews: [],
      followGuide: false,
    };

  const state: HomeState = fresh.length > 0 ? "new" : "quiet";
  const nothingElse =
    fresh.length === 0 &&
    closingSoon.length === 0 &&
    startedFavorites.length === 0 &&
    followedNews.length === 0;
  return {
    state,
    // A return visit with nothing to show falls back to open interest posters.
    openInterest: nothingElse ? openInterest : [],
    fresh,
    closingSoon,
    startedFavorites,
    followedNews,
    followGuide:
      state === "quiet" &&
      favorites.length === 0 &&
      input.followedInstitutionIds.length === 0,
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
