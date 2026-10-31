/**
 * Screen wording for a poster's reception status (UI redesign plan, section 2).
 * The status itself always comes from getPosterApplicationState; this only maps
 * it to labels, so every screen shows the same words for the same poster.
 */
import {
  POSTER_TIME_ZONE,
  getPosterApplicationState,
  type PosterApplicationInput,
} from "./posterApplication";

export type ReceptionKind =
  | "scheduled"
  | "open"
  | "ongoing"
  | "until_exhausted"
  | "closed"
  | "unconfirmed";

/** accent: D-n · accent-strong: 오늘 마감 chip · ink: no-date deadlines · muted: closed. */
export type DeadlineTone =
  | "accent"
  | "accent-strong"
  | "ink"
  | "neutral"
  | "muted";

export type DeadlineDisplay = {
  reception: ReceptionKind;
  /** Status chip: 접수 예정 · 접수 중 · 상시 모집 · 소진 시 마감 · 접수 종료 · 마감일 확인 필요 */
  receptionLabel: string;
  /** DeadlineLabel text. */
  text: string;
  tone: DeadlineTone;
  /** Days until the deadline, only when the date is trusted and reception is open. */
  daysLeft: number | null;
  /** True only for a fixed deadline with a parseable end date. */
  dateTrusted: boolean;
  /** "11.05" in Asia/Seoul, only when the date is trusted. */
  endDateLabel: string | null;
};

const RECEPTION_LABELS: Record<ReceptionKind, string> = {
  scheduled: "접수 예정",
  open: "접수 중",
  ongoing: "상시 모집",
  until_exhausted: "소진 시 마감",
  closed: "접수 종료",
  unconfirmed: "마감일 확인 필요",
};

const monthDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: POSTER_TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
});

function monthDay(value?: string | null) {
  if (!value) return null;
  const time = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+09:00` : value,
  );
  if (Number.isNaN(time)) return null;
  const parts = Object.fromEntries(
    monthDayFormatter
      .formatToParts(new Date(time))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}.${parts.day}`;
}

function display(
  reception: ReceptionKind,
  text: string,
  tone: DeadlineTone,
  trusted?: { daysLeft: number; endDateLabel: string | null },
): DeadlineDisplay {
  return {
    reception,
    receptionLabel: RECEPTION_LABELS[reception],
    text,
    tone,
    daysLeft: trusted?.daysLeft ?? null,
    dateTrusted: Boolean(trusted),
    endDateLabel: trusted?.endDateLabel ?? null,
  };
}

export function getDeadlineDisplay(
  input: PosterApplicationInput,
): DeadlineDisplay {
  const state = getPosterApplicationState(input);
  const endDateLabel = monthDay(input.applicationEndAt);

  switch (state.status) {
    case "scheduled":
      return display("scheduled", "접수 예정", "neutral");
    case "ongoing":
      return display("ongoing", "상시 모집", "ink");
    case "until_exhausted":
      return display("until_exhausted", "소진 시 마감", "ink");
    case "closed":
      return display("closed", "접수 종료", "muted");
    case "due_today":
      return display("open", "오늘 마감", "accent-strong", {
        daysLeft: 0,
        endDateLabel,
      });
    case "open":
    case "closing_soon":
      // "open" without daysLeft is a deadline whose type is unknown: no D-day.
      if (state.daysLeft === null) break;
      return display("open", `D-${state.daysLeft}`, "accent", {
        daysLeft: state.daysLeft,
        endDateLabel,
      });
    case "needs_confirmation":
      break;
  }
  return display("unconfirmed", "마감일은 원문에서 확인", "neutral");
}

/** "7일 안에 마감": trusted deadline from today through 6 days later. */
export function isClosingWithinDays(value: DeadlineDisplay, days = 7) {
  return (
    value.daysLeft !== null && value.daysLeft >= 0 && value.daysLeft < days
  );
}
