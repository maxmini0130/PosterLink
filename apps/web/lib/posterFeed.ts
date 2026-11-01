import { getDeadlineDisplay, isClosingWithinDays } from "./deadlineDisplay";
import { groupByRegionScope, type RegionNode } from "./searchGroups";
import type { HomeItem, HomeEntry } from "./homeSections";
import {
  optimizablePosterImage,
  usablePosterImage,
  type PosterImageMeta,
} from "./feedImages";
export type FeedData = PosterImageMeta & { image?: string };
/** Keep publication-day order; interleave images only among equal-day matches. */
export function mixFeedImages<T extends FeedData>(items: HomeEntry<T>[]) {
  const groups = new Map<string, HomeEntry<T>[]>();
  for (const item of items) {
    const day = new Date(item.publishedAt ?? 0).toLocaleDateString("en-CA", {
      timeZone: "Asia/Seoul",
    });
    const group = groups.get(day) ?? [];
    group.push(item);
    groups.set(day, group);
  }
  const out: HomeEntry<T>[] = [];
  for (const group of groups.values()) {
    const real = group.filter(
      (i) =>
        optimizablePosterImage(i.data.image) &&
        usablePosterImage(i.data.image, i.data),
    );
    const defaults = group.filter((i) => !real.includes(i));
    while (real.length || defaults.length) {
      const reserved = Math.max(0, Math.ceil(defaults.length / 2) - 1);
      if (real.length > reserved) {
        out.push(real.shift()!);
        continue;
      }
      out.push(...defaults.splice(0, 2));
      if (real.length) out.push(real.shift()!);
    }
  }
  return out;
}
export function buildPosterFeed<T extends FeedData>({
  items,
  favoriteIds,
  regionId,
  regions,
  baselineAt,
  memberInterest,
  now,
}: {
  items: HomeItem<T>[];
  favoriteIds: Set<string>;
  regionId: string | null;
  regions: RegionNode[];
  baselineAt: number | null;
  memberInterest: boolean;
  now: Date;
}) {
  const seen = new Set<string>();
  const entries = items
    .filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .map((i) => ({
      ...i,
      display: getDeadlineDisplay({ ...i.application, now }),
      favorite: favoriteIds.has(i.id),
    }))
    .filter((i) =>
      ["open", "ongoing", "until_exhausted"].includes(i.display.reception),
    )
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  const { matched, wider } = groupByRegionScope(
    entries,
    (i) => i.regionIds,
    regionId,
    regions,
  );
  const own = mixFeedImages(matched);
  return {
    own,
    wider: wider.map(({ item, scope }) => ({ entry: item, scope })),
    fresh:
      memberInterest && baselineAt !== null
        ? own.filter(
            (i) => i.publishedAt !== null && i.publishedAt > baselineAt,
          )
        : [],
    closing: own.filter((i) => isClosingWithinDays(i.display, 7)),
  };
}
export const FEED_DISMISS_KEY = "pl.feed_interest_dismissed.v1";
export function interestPromptVisible(
  store: Pick<Storage, "getItem">,
  now: number,
) {
  try {
    const at = Number(store.getItem(FEED_DISMISS_KEY));
    return (
      !Number.isFinite(at) || at <= 0 || at > now || now - at >= 7 * 86400000
    );
  } catch {
    return true;
  }
}
