/**
 * Grouping and per-card wording for 내 공고 (UI redesign plan ⑩, retention plan
 * 3-1). The person's own mark (찜 / 신청했어요) and the poster's reception status
 * are separate: grouping uses only the poster, the mark never changes it.
 */
import { getDeadlineDisplay, type DeadlineDisplay } from "./deadlineDisplay";
import type { PosterApplicationInput } from "./posterApplication";

export type UserStatus = "interested" | "applied";

export type ReceptionGroupKey = "scheduled" | "open" | "unconfirmed" | "closed";

export const RECEPTION_GROUP_LABELS: Record<ReceptionGroupKey, string> = {
  scheduled: "접수 예정",
  open: "접수 중",
  unconfirmed: "접수 일정 확인 필요",
  closed: "접수 종료",
};

const GROUP_ORDER: ReceptionGroupKey[] = [
  "scheduled",
  "open",
  "unconfirmed",
  "closed",
];

export function receptionGroup(display: DeadlineDisplay): ReceptionGroupKey {
  switch (display.reception) {
    case "scheduled":
    case "closed":
    case "unconfirmed":
      // Unconfirmed (no date, unparseable or untrusted deadline type) is not
      // claimed to be open; the card sends the person to the original.
      return display.reception;
    case "open":
    case "ongoing":
    case "until_exhausted":
      return "open";
  }
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
 * Groups items by reception status in the order 접수 예정 → 접수 중 → 접수 일정
 * 확인 필요 → 접수 종료, dropping empty groups. Within 접수 중, dated deadlines
 * come first, soonest first; elsewhere the original order (most recently
 * saved) is kept.
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

/**
 * Keeps a list screen's reads from undoing its own writes. A read started
 * before or during a write may return the old row, so while a write runs no
 * read result is applied: a read already in flight is dropped and one asked
 * for meanwhile is deferred, and `endWrite` says when to read again. Among
 * reads, only the newest result is applied.
 */
export function createReadWriteGate() {
  let seq = 0;
  let inFlight = 0;
  let writes = 0;
  let readAgain = false;
  return {
    /** A token for a new read, or null when a write runs (read after it). */
    beginRead(): number | null {
      if (writes > 0) {
        readAgain = true;
        return null;
      }
      inFlight = ++seq;
      return seq;
    },
    /** Whether this read's result may still be applied. */
    endRead(token: number) {
      if (inFlight === token) inFlight = 0;
      return token === seq && writes === 0;
    },
    beginWrite() {
      writes += 1;
      if (inFlight) {
        seq += 1; // the read in flight may predate this write
        inFlight = 0;
        readAgain = true;
      }
    },
    /** True when the last write ended and a dropped or deferred read is due. */
    endWrite() {
      writes = Math.max(0, writes - 1);
      if (writes > 0 || !readAgain) return false;
      readAgain = false;
      return true;
    },
  };
}
