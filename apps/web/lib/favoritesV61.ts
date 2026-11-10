/**
 * v6.1 찜 groups (docs/design/v6.1/SPEC.md 7.4), in this order:
 *   1. 마감일이 확인된 공고 — 날짜·시각 확인, 날짜만 확인; soonest first.
 *   2. 마감 알림이 없는 공고 — 회차별, 문구 표시, 마감일 미확인, 접수 여부 미확인.
 *   3. 신청한 공고 — marked by the person.
 *   4. 마감된 공고.
 * Header: 접수 중 N · 이번 주 마감 N (applied left out; the week is Mon–Sun, KST).
 */
import {
  getDeadlinePresentation,
  type DeadlinePresentation,
} from "./deadlinePresentation";
import {
  cardDeadlineInput,
  type DeadlineCardFields,
} from "./posterDeadlineFields";

export type FavoriteEntry<T extends DeadlineCardFields & { id: string }> = {
  card: T;
  applied: boolean;
};

export type FavoriteRowItem<T> = {
  card: T;
  presentation: DeadlinePresentation;
  /** Rows with D-3 … 오늘 show [주요 버튼] [✓ 신청했어요]. */
  expanded: boolean;
};

export type FavoriteGroups<T> = {
  confirmed: FavoriteRowItem<T>[];
  noAlert: FavoriteRowItem<T>[];
  applied: FavoriteRowItem<T>[];
  closed: FavoriteRowItem<T>[];
  openCount: number;
  dueThisWeek: number;
};

const CONFIRMED = new Set(["verified_time", "date_only"]);

const kstDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

/** Days left until this Sunday (KST): Monday 6 … Sunday 0. */
function daysToSunday(now: Date) {
  const weekday = kstDay
    .formatToParts(now)
    .find((part) => part.type === "weekday")?.value;
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const index = order.indexOf(weekday ?? "Mon");
  return 6 - (index < 0 ? 0 : index);
}

export function groupFavorites<T extends DeadlineCardFields & { id: string }>(
  entries: FavoriteEntry<T>[],
  now: Date = new Date(),
): FavoriteGroups<T> {
  const groups: FavoriteGroups<T> = {
    confirmed: [],
    noAlert: [],
    applied: [],
    closed: [],
    openCount: 0,
    dueThisWeek: 0,
  };
  const weekLeft = daysToSunday(now);
  for (const entry of entries) {
    const presentation = getDeadlinePresentation({
      ...cardDeadlineInput(entry.card, now),
      applied: entry.applied,
    });
    const shown = getDeadlinePresentation(cardDeadlineInput(entry.card, now));
    const row = (expanded = false) => ({
      card: entry.card,
      presentation,
      expanded,
    });
    if (entry.applied) {
      groups.applied.push(row());
      continue;
    }
    if (shown.state === "closed") {
      groups.closed.push(row());
      continue;
    }
    groups.openCount += 1;
    if (CONFIRMED.has(shown.state)) {
      const days = shown.dday ?? 99;
      groups.confirmed.push(row(days >= 0 && days <= 3));
      if (days >= 0 && days <= weekLeft) groups.dueThisWeek += 1;
    } else groups.noAlert.push(row());
  }
  const endTime = (item: FavoriteRowItem<T>) =>
    Date.parse(item.card.deadline ?? "") || Number.MAX_SAFE_INTEGER;
  groups.confirmed.sort(
    (a, b) =>
      (a.presentation.dday ?? 99) - (b.presentation.dday ?? 99) ||
      endTime(a) - endTime(b),
  );
  return groups;
}
