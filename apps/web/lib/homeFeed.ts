/**
 * Home v5 layout (UI plan 3-4 C-0; poster feed instruction 11–14).
 *
 * Order: 눈여겨볼 공고 → 7일 안에 마감 → 새로 올라온 공고 (12 per page) with one
 * curated bundle after every page, and the institution suggestions once after
 * the first bundle. A poster appears on the home once: each block only takes
 * posters no earlier block used. A section with fewer than 3 posters is left
 * out entirely. Pure: the same input always gives the same pages, so the
 * server render and the "더 보기" requests agree.
 */
import { getDeadlineDisplay, type DeadlineDisplay } from "./deadlineDisplay";
import {
  getDeadlinePresentation,
  type DeadlinePresentation,
} from "./deadlinePresentation";
import { cardDeadlineInput } from "./posterDeadlineFields";
import { homeChipOf, type HomeChipId } from "./homeChips";
import type { PosterApplicationInput } from "./posterApplication";
import { mixFeedImages } from "./posterFeed";
import type { HomeEntry } from "./homeSections";
import type { PlPosterCardData } from "../app/components/pl/PosterListCard";
import { eventEnded, kstDateKey, type CardSchedule } from "./cardFacts";
import { daysToSunday } from "./favoritesV61";

/** Deadlines with evidence (SPEC 7.4 '마감일이 확인된 공고'). */
const CONFIRMED_DEADLINE = new Set(["verified_time", "date_only"]);

export const HOME_PAGE_SIZE = 12;
export const ROW_LIMIT = 6;
export const MIN_SECTION = 3;

export type CuratedId =
  | "curated_weekend_free"
  | "curated_youth_support"
  | "curated_new_orgs";
export type HomeSectionId =
  | "pick"
  | "deadline"
  | "followed"
  | "new"
  | "org"
  | CuratedId;

export type HomeCardData = PlPosterCardData & {
  /** `지역 문구 · 신청 대상`, null when neither is confirmed. */
  metaLine?: string | null;
  /** Confirmed key fact (and event day), null when none. */
  benefitLine?: string | null;
  /** Organiser institution (follow prompt target); never the source. */
  organizerId?: string | null;
};

export type HomePoster = {
  id: string;
  publishedAt: number | null;
  regionIds: string[];
  categoryIds: string[];
  /** The main category (7+1) the poster's content type folds into. */
  interestCode: string | null;
  /** Unfolded content-type codes (primary first), for the v6.1 field chips. */
  contentCodes?: string[];
  application: PosterApplicationInput;
  schedule: CardSchedule;
  benefitKind?: string | null;
  cardFactsStatus?: string | null;
  hasBenefit: boolean;
  /** KST Monday the poster was picked for, YYYY-MM-DD. */
  featuredWeek?: string | null;
  /** 7-day favorites + views (or the stored favorite count when unavailable). */
  popularity: number;
  youth: boolean;
  organizerKey: string | null;
  /** posters.organizer_id (follows target the actual organiser only). */
  organizerId?: string | null;
  card: HomeCardData;
};

export type HomeCard = {
  id: string;
  card: HomeCardData;
  display: DeadlineDisplay;
  /** v6.1 deadline wording, stamp and home eligibility (SPEC 4). */
  presentation: DeadlinePresentation;
};

export type OrgSuggestion = {
  id: string;
  slug: string;
  name: string;
  recentCount: number;
};

export type HomeBlock =
  | { kind: "new"; items: HomeCard[] }
  | {
      kind: "bundle";
      id: CuratedId;
      title: string;
      href: string;
      items: HomeCard[];
    }
  | { kind: "orgs"; items: OrgSuggestion[] };

export type HomeLayout = {
  picks: HomeCard[];
  deadline: HomeCard[];
  /** 팔로우 기관 소식: open posters of followed organisers (members). */
  followed: HomeCard[];
  /** Every open poster closing within 7 days (the section shows a few). */
  deadlineTotal: number;
  /** Open posters in the home scope (the "접수 중 N" count). */
  openTotal: number;
  /** Condition-matching open posters published after `since` (members). */
  freshSince: number;
  pages: HomeBlock[][];
  /** Whether another "새로 올라온 공고" page exists after `pages`. */
  hasMore: boolean;
  /** Open posters per field chip within the chosen region (all chips). */
  chipCounts: Record<HomeChipId, number>;
  /** The chip the feed is narrowed to, if any. */
  chip: HomeChipId | null;
  /**
   * 찜 "이번 주에 마감되는 공고" (SPEC 7.4): confirmed deadlines closing by this
   * Sunday (KST), soonest first. Only filled when asked for (`dueWeekLimit`).
   */
  dueWeek?: HomeCard[];
  /** True when the feed lists only posters published after `since`. */
  onlySince: boolean;
};

export type HomeConditions = {
  /** Region ids the chosen region covers; empty = no region condition. */
  regionScope: Set<string>;
  /** Category ids the chosen categories cover; empty = none. */
  categoryScope: Set<string>;
};

const NO_CONDITIONS: HomeConditions = {
  regionScope: new Set(),
  categoryScope: new Set(),
};

const DAY = 86400000;

/** KST Monday (YYYY-MM-DD) of the week containing `now`. */
export function kstWeekMonday(now: Date) {
  const key = kstDateKey(now);
  const day = new Date(`${key}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY).toISOString().slice(0, 10);
}

/** This weekend in KST: the coming Sat–Sun, or the current one on Sat/Sun. */
export function kstWeekend(now: Date) {
  const monday = Date.parse(`${kstWeekMonday(now)}T00:00:00Z`);
  const sat = new Date(monday + 5 * DAY).toISOString().slice(0, 10);
  const sun = new Date(monday + 6 * DAY).toISOString().slice(0, 10);
  return { sat, sun };
}

export type CuratedBundle = {
  id: CuratedId;
  title: string;
  href: string;
  match: (poster: HomePoster, now: Date) => boolean;
  /** Optional: keep only one poster per key (e.g. per institution). */
  distinctBy?: (poster: HomePoster) => string | null;
};

/**
 * Bundles are data conditions only, so they need no weekly operator work.
 * Add a bundle by appending a definition here.
 */
export const CURATED_BUNDLES: CuratedBundle[] = [
  {
    id: "curated_weekend_free",
    title: "이번 주말 무료로 참여하는 체험",
    href: "/posters",
    match: (poster, now) => {
      const { eventStartAt: start, eventEndAt: end } = poster.schedule;
      if (
        poster.benefitKind !== "free" ||
        poster.cardFactsStatus !== "verified"
      )
        return false;
      if (!start || Number.isNaN(Date.parse(start))) return false;
      const last = end && !Number.isNaN(Date.parse(end)) ? end : start;
      if (Date.parse(last) - Date.parse(start) > 3 * DAY) return false;
      const { sat, sun } = kstWeekend(now);
      return kstDateKey(start) <= sun && kstDateKey(last) >= sat;
    },
  },
  {
    id: "curated_youth_support",
    title: "청년 지원금·월세 모음",
    href: "/categories/welfare",
    match: (poster) =>
      poster.youth &&
      (poster.interestCode === "CAT_WELFARE" ||
        poster.interestCode === "CAT_HOUSING"),
  },
  {
    id: "curated_new_orgs",
    title: "이번 주 새 공고를 올린 기관",
    href: "/institutions",
    match: (poster, now) =>
      Boolean(poster.organizerKey) &&
      poster.publishedAt !== null &&
      now.getTime() - poster.publishedAt <= 7 * DAY,
    distinctBy: (poster) => poster.organizerKey,
  },
];

function matchesConditions(poster: HomePoster, conditions: HomeConditions) {
  const { regionScope, categoryScope } = conditions;
  if (!regionScope.size && !categoryScope.size) return false;
  const region =
    !regionScope.size || poster.regionIds.some((id) => regionScope.has(id));
  const category =
    !categoryScope.size ||
    poster.categoryIds.some((id) => categoryScope.has(id));
  return region && category;
}

/** Condition matches first, keeping each group's order. */
function conditionFirst<T extends HomePoster>(
  list: T[],
  conditions: HomeConditions,
) {
  const matched = list.filter((p) => matchesConditions(p, conditions));
  if (!matched.length) return list;
  return [...matched, ...list.filter((p) => !matched.includes(p))];
}

type Judged = HomePoster & {
  display: DeadlineDisplay;
  presentation: DeadlinePresentation;
};

function toCard(poster: Judged): HomeCard {
  return {
    id: poster.id,
    card: poster.card,
    display: poster.display,
    presentation: poster.presentation,
  };
}

/** States the home lists (SPEC 4.3: closed posters and 접수 예정 stay off). */
function onHome(presentation: DeadlinePresentation) {
  return (
    presentation.showOnHome &&
    presentation.state !== "closed" &&
    presentation.state !== "scheduled"
  );
}

/** Same-day posters interleave real posters with default images. */
function mixed<T extends Judged>(list: T[]): T[] {
  const entries: HomeEntry<HomeCardData>[] = list.map((poster) => ({
    id: poster.id,
    publishedAt: poster.publishedAt,
    institutionIds: [],
    application: poster.application,
    data: poster.card,
    display: poster.display,
    favorite: false,
  }));
  const byId = new Map(list.map((poster) => [poster.id, poster]));
  return mixFeedImages(entries).map((entry) => byId.get(entry.id)!);
}

export function buildHomeLayout({
  posters,
  now,
  conditions = NO_CONDITIONS,
  orgs = [],
  followedIds = new Set<string>(),
  since = null,
  pageCount = 1,
  bundles = CURATED_BUNDLES,
  chip = null,
  onlySince = false,
  upperRows = true,
  dueWeekLimit = 0,
}: {
  posters: HomePoster[];
  now: Date;
  conditions?: HomeConditions;
  orgs?: OrgSuggestion[];
  /** Organiser institution ids the member follows. */
  followedIds?: Set<string>;
  /** The member's last-visit baseline (ms) for "방문 이후" counts. */
  since?: number | null;
  /** How many "새로 올라온 공고" pages to lay out (1-based). */
  pageCount?: number;
  bundles?: CuratedBundle[];
  /** v6.1 field chip: the feed lists only that field. */
  chip?: HomeChipId | null;
  /** "지난 방문 이후 N건": the feed lists only posters published after `since`. */
  onlySince?: boolean;
  /**
   * v5 rows above the feed (눈여겨볼 공고, 7일 안에 마감, 팔로우 기관 소식).
   * v6.1 lists the posters first (SPEC 7.1), so it turns these off; their
   * posters then stay in the feed instead of being used up.
   */
  upperRows?: boolean;
  /** How many "이번 주에 마감되는 공고" to return (0 = none). */
  dueWeekLimit?: number;
}): HomeLayout {
  const seenIds = new Set<string>();
  const open = posters
    .filter((poster) => {
      if (seenIds.has(poster.id)) return false;
      seenIds.add(poster.id);
      return true;
    })
    .map((poster) => ({
      ...poster,
      display: getDeadlineDisplay({ ...poster.application, now }),
      // The poster's application values are the source; the card only adds
      // the v6.1 confirmation columns (and the viewer's applied mark).
      presentation: getDeadlinePresentation({
        ...cardDeadlineInput(poster.card, now),
        ...poster.application,
        now,
      }),
    }))
    .filter((poster) => onHome(poster.presentation))
    .filter((poster) => !eventEnded(poster.schedule, now))
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  type Open = (typeof open)[number];
  const used = new Set<string>();
  const take = (list: Open[], limit: number) => {
    const out: Open[] = [];
    for (const poster of list) {
      if (out.length >= limit) break;
      if (used.has(poster.id)) continue;
      out.push(poster);
    }
    return out;
  };
  const commit = (list: Open[]) => {
    for (const poster of list) used.add(poster.id);
    return list.map(toCard);
  };

  // 3. 눈여겨볼 공고: operator picks of this week, then automatic fill.
  const week = kstWeekMonday(now);
  const picked = open.filter((poster) => poster.featuredWeek === week);
  const auto = conditionFirst(
    open
      .filter(
        (poster) =>
          poster.featuredWeek !== week &&
          poster.hasBenefit &&
          poster.cardFactsStatus === "verified",
      )
      .sort((a, b) => b.popularity - a.popularity),
    conditions,
  );
  const pickList = take([...picked, ...auto], ROW_LIMIT);
  const picks =
    upperRows && pickList.length >= MIN_SECTION ? commit(pickList) : [];

  // 4. 7일 안에 마감, soonest first: confirmed dates only (v6.1 D-day).
  const closing = open
    .filter(
      (poster) =>
        poster.presentation.dday !== null &&
        poster.presentation.dday >= 0 &&
        poster.presentation.dday < 7,
    )
    .sort(
      (a, b) =>
        (a.presentation.dday ?? 99) - (b.presentation.dday ?? 99) ||
        (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
    );
  const deadlineList = take(conditionFirst(closing, conditions), ROW_LIMIT);
  const deadline =
    upperRows && deadlineList.length >= MIN_SECTION ? commit(deadlineList) : [];

  // 팔로우 기관 소식 (members who follow organisers), newest first.
  const followedList = followedIds.size
    ? take(
        open.filter(
          (poster) => poster.organizerId && followedIds.has(poster.organizerId),
        ),
        ROW_LIMIT,
      )
    : [];
  const followed =
    upperRows && followedList.length >= MIN_SECTION ? commit(followedList) : [];

  // 5. 새로 올라온 공고, with a bundle after each page and the institution
  // suggestions once after the first bundle.
  // v6.1 chips count the chosen region's open posters (all chips at once).
  const inRegion = (poster: Open) =>
    !conditions.regionScope.size ||
    poster.regionIds.some((id) => conditions.regionScope.has(id));
  const chipCounts: Record<HomeChipId, number> = {
    support: 0,
    education: 0,
    culture: 0,
    jobs: 0,
    contest: 0,
  };
  for (const poster of open) {
    if (!inRegion(poster)) continue;
    const id = homeChipOf(poster.contentCodes ?? []);
    if (id) chipCounts[id] += 1;
  }
  const isFresh = (poster: Open) =>
    since !== null && poster.publishedAt !== null && poster.publishedAt > since;
  const feedPool = open.filter(
    (poster) =>
      (!chip || homeChipOf(poster.contentCodes ?? []) === chip) &&
      (!onlySince || (isFresh(poster) && inRegion(poster))),
  );
  const fresh = mixed(conditionFirst(feedPool, conditions));
  const pages: HomeBlock[][] = [];
  let bundleIndex = 0;
  let orgsPlaced = false;
  for (let page = 0; page < pageCount; page += 1) {
    const blocks: HomeBlock[] = [];
    const newItems = take(fresh, HOME_PAGE_SIZE);
    if (!newItems.length) break;
    blocks.push({ kind: "new", items: commit(newItems) });
    while (bundleIndex < bundles.length) {
      const bundle = bundles[bundleIndex++];
      const keys = new Set<string>();
      const candidates = conditionFirst(
        open.filter((poster) => {
          if (used.has(poster.id) || !bundle.match(poster, now)) return false;
          const key = bundle.distinctBy?.(poster);
          if (bundle.distinctBy) {
            if (!key || keys.has(key)) return false;
            keys.add(key);
          }
          return true;
        }),
        conditions,
      );
      const items = take(candidates, ROW_LIMIT);
      if (items.length < MIN_SECTION) continue;
      blocks.push({
        kind: "bundle",
        id: bundle.id,
        title: bundle.title,
        href: bundle.href,
        items: commit(items),
      });
      break;
    }
    const bundled = blocks.some((block) => block.kind === "bundle");
    if (!orgsPlaced && (bundled || bundleIndex >= bundles.length)) {
      orgsPlaced = true;
      if (orgs.length >= MIN_SECTION)
        blocks.push({ kind: "orgs", items: orgs.slice(0, 8) });
    }
    pages.push(blocks);
  }
  // Not marked as used: the 찜 screen asks for these on their own.
  const weekLeft = daysToSunday(now);
  const dueWeek =
    dueWeekLimit > 0
      ? closing
          .filter(
            (poster) =>
              CONFIRMED_DEADLINE.has(poster.presentation.state) &&
              (poster.presentation.dday ?? 99) <= weekLeft,
          )
          .slice(0, dueWeekLimit)
          .map(toCard)
      : undefined;
  return {
    picks,
    deadline,
    followed,
    ...(dueWeek ? { dueWeek } : {}),
    deadlineTotal: closing.length,
    // "접수 중 N건": the chosen region's open posters (SPEC 7.1).
    openTotal: open.filter(inRegion).length,
    freshSince:
      since === null
        ? 0
        : open.filter(
            (poster) =>
              poster.publishedAt !== null &&
              poster.publishedAt > since &&
              (!conditions.regionScope.size && !conditions.categoryScope.size
                ? true
                : matchesConditions(poster, conditions)),
          ).length,
    pages,
    hasMore: fresh.some((poster) => !used.has(poster.id)),
    chipCounts,
    chip,
    onlySince: onlySince && since !== null,
  };
}
