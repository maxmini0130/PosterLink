/**
 * Grouping and per-card wording for 내 공고 (UI redesign plan ⑩, retention plan
 * 3-1). The person's own mark (찜 / 신청했어요) and the poster's reception status
 * are separate: grouping uses only the poster, the mark never changes it.
 */
import { getDeadlineDisplay, type DeadlineDisplay } from "./deadlineDisplay";
import type { PosterApplicationInput } from "./posterApplication";

export type UserStatus = "interested" | "applied";

export type ReceptionGroupKey = "scheduled" | "open" | "closed";

export const RECEPTION_GROUP_LABELS: Record<ReceptionGroupKey, string> = {
  scheduled: "접수 예정",
  open: "접수 중",
  closed: "접수 종료",
};

const GROUP_ORDER: ReceptionGroupKey[] = ["scheduled", "open", "closed"];

export function receptionGroup(display: DeadlineDisplay): ReceptionGroupKey {
  if (display.reception === "scheduled") return "scheduled";
  if (display.reception === "closed") return "closed";
  // Open, no-date (상시·소진 시) and unconfirmed deadlines are all still listed
  // as accepting; the card's own label says which.
  return "open";
}

/** Card note for a deadline that has no date to be reminded of. */
export function noDateNote(display: DeadlineDisplay) {
  return display.reception === "ongoing" ||
    display.reception === "until_exhausted"
    ? "마감일이 없는 공고라 날짜 알림은 없어요"
    : null;
}

export type GroupedItem<T> = { item: T; display: DeadlineDisplay };

/**
 * Groups items by reception status in the order 접수 예정 → 접수 중 → 접수 종료,
 * dropping empty groups. Within 접수 중, trusted deadlines come first, soonest
 * first; elsewhere the original order (most recently saved) is kept.
 */
export function groupByReception<T>(
  items: T[],
  input: (item: T) => PosterApplicationInput,
) {
  const groups = new Map<ReceptionGroupKey, GroupedItem<T>[]>();
  for (const item of items) {
    const display = getDeadlineDisplay(input(item));
    const key = receptionGroup(display);
    groups.set(key, [...(groups.get(key) ?? []), { item, display }]);
  }
  const open = groups.get("open");
  if (open) {
    open.sort((a, b) => {
      const da = a.display.daysLeft ?? Number.POSITIVE_INFINITY;
      const db = b.display.daysLeft ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }
  return GROUP_ORDER.filter((key) => groups.has(key)).map((key) => ({
    key,
    label: RECEPTION_GROUP_LABELS[key],
    items: groups.get(key)!,
  }));
}
