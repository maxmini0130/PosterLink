/**
 * Deadline wording for every screen (docs/design/v6.1/SPEC.md, chapter 4).
 * One pure function decides the state, the card, row and detail wording, the
 * D-day stamp and whether a deadline reminder applies, so the same poster
 * reads the same everywhere. Screens do not compute dates themselves.
 *
 * Names follow the repository: `deadlineType` is posters.deadline_type
 * (SPEC `deadline_kind`; `until_full` = until_exhausted, `rolling` = ongoing,
 * plus the new `per_session`), `applicationEndAt` is posters.application_end_at.
 * The remaining fields are the columns stage 2 adds. Until a field exists it is
 * left out and its default applies; the defaults never claim more than is known:
 * a time is shown only when `deadlineTimeVerified` is true, so a stored
 * 23:59:59 (the end of a date-only deadline) is read as "date only".
 */
import { POSTER_TIME_ZONE } from "./posterApplication";

export type DeadlineStatus = "verified" | "unverified" | "conflict";

export type DeadlineInput = {
  /** posters.deadline_type: fixed · per_session · until_exhausted · ongoing · scheduled · unknown */
  deadlineType?: string | null;
  applicationStartAt?: string | null;
  /** posters.application_end_at. A date-only deadline is stored at 23:59:59 KST. */
  applicationEndAt?: string | null;
  /** Default "unverified". */
  deadlineStatus?: DeadlineStatus | null;
  /** Default false: a stored time is not shown unless someone checked it. */
  deadlineTimeVerified?: boolean | null;
  /** Default false: open reception has not been confirmed. */
  receptionVerified?: boolean | null;
  sessionRuleText?: string | null;
  sessionRuleVerified?: boolean | null;
  /** YYYY-MM-DD in Asia/Seoul. Never used as the poster's deadline. */
  lastSessionDeadlineDate?: string | null;
  /** Wording for until_exhausted and ongoing, e.g. "정원 마감 때까지". */
  deadlineLabel?: string | null;
  /** One line under the detail deadline, e.g. "조기 마감될 수 있어요". */
  deadlineNote?: string | null;
  eventEndAt?: string | null;
  posterStatus?: string | null;
  /** The viewer marked this poster as applied (SPEC 5장). */
  applied?: boolean | null;
  now?: Date;
};

export type DeadlineState =
  | "applied"
  | "closed"
  | "scheduled"
  | "verified_time"
  | "date_only"
  | "per_session"
  | "per_session_unverified"
  | "label"
  | "unverified"
  | "reception_unknown";

export type DeadlineStamp = "D-3" | "D-2" | "D-1" | "오늘";
export type DeadlineTone = "default" | "muted" | "applied";

export type DeadlinePresentation = {
  state: DeadlineState;
  /** Two-column card: short time ("23:59까지"). */
  card: string;
  /** List rows (찜, similar posters): long time, D-day when there is no stamp. */
  row: string;
  /** Detail '신청 마감' value, or the closed banner. */
  detail: string;
  /** Line under the detail value. */
  detailCaption: string | null;
  /** Right side of the detail value: "D-3", "오늘", "마지막 접수 12.13(일)". */
  detailAside: string | null;
  detailNote: string | null;
  stamp: DeadlineStamp | null;
  dday: number | null;
  /** 접수 중 · 접수 예정 · 접수 종료 · 접수 여부 확인 */
  statusTag: string;
  tone: DeadlineTone;
  /** "8월 17일" when the day reception ended is known. */
  closedOn: string | null;
  /** Home 찜 마감 줄 (the caller checks the poster is a favorite). */
  homeAlert: boolean;
  /** Reminder delivery: until the time, or until the day before for date only. */
  pushAlert: boolean;
  /** False when closed, or when an unverified date has already passed. */
  showOnHome: boolean;
  /** Similar-poster suggestions take only posters with confirmed reception (SPEC 8장). */
  recommendable: boolean;
};

const MS_PER_DAY = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: POSTER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: POSTER_TIME_ZONE,
  weekday: "short",
});

type SeoulMoment = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  /** Days since the epoch for the Seoul calendar date. */
  ordinal: number;
};

function seoul(time: number): SeoulMoment {
  const parts = Object.fromEntries(
    partsFormatter
      .formatToParts(new Date(time))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    weekday: weekdayFormatter.format(new Date(time)),
    ordinal: Math.floor(
      Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY,
    ),
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date-only value means the end of that Seoul day. */
function parse(value?: string | null, endOfDay = true) {
  if (!value) return null;
  const time = Date.parse(
    DATE_ONLY.test(value)
      ? `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+09:00`
      : value,
  );
  return Number.isNaN(time) ? null : time;
}

function dateLabel(moment: SeoulMoment, today: SeoulMoment) {
  const day = `${moment.month}.${moment.day}(${moment.weekday})`;
  return moment.year === today.year ? day : `${moment.year}.${day}`;
}

function shortDate(moment: SeoulMoment, today: SeoulMoment) {
  const day = `${moment.month}.${moment.day}`;
  return moment.year === today.year ? day : `${moment.year}.${day}`;
}

/**
 * 1~11 오전, 12 낮, 13~20 오후, 21~23 밤. A verified 00:00 deadline is shown
 * on the day before as 밤 12시 (see withoutApplied), so hour 0 reads 밤 12시.
 */
function spokenTime({ hour, minute }: SeoulMoment) {
  const period =
    hour >= 1 && hour <= 11
      ? "오전"
      : hour === 12
        ? "낮"
        : hour >= 13 && hour <= 20
          ? "오후"
          : "밤";
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${period} ${h}시${minute ? ` ${minute}분` : ""}`;
}

/** Cards have one line: a time with minutes becomes "23:59". */
function cardTime(moment: SeoulMoment) {
  return moment.minute
    ? `${moment.hour}:${String(moment.minute).padStart(2, "0")}`
    : spokenTime(moment);
}

function stampFor(days: number): DeadlineStamp | null {
  if (days === 0) return "오늘";
  return days >= 1 && days <= 3 ? (`D-${days}` as DeadlineStamp) : null;
}

const KINDS = new Set([
  "fixed",
  "per_session",
  "until_exhausted",
  "ongoing",
  "scheduled",
  "unknown",
]);

function kindOf(value?: string | null) {
  const kind = String(value ?? "")
    .trim()
    .toLowerCase();
  return KINDS.has(kind) ? kind : "unknown";
}

const LABEL_DEFAULT: Record<string, string> = {
  until_exhausted: "소진 시 마감",
  ongoing: "상시 모집",
};

const CONFLICT_CAPTION =
  "마감일이 서로 다르게 올라와 있어 확인하고 있어요. 확인 전에는 D-day와 마감 알림을 표시하지 않아요.";
// SPEC 12장 B: wording for an unverified (not conflicting) date is a proposal.
const UNVERIFIED_CAPTION =
  "마감일을 확인하고 있어요. 확인 전에는 D-day와 마감 알림을 표시하지 않아요.";

/** States where reception is open and known to be open, so a suggestion is fair. */
const RECOMMENDABLE = new Set<DeadlineState>([
  "verified_time",
  "date_only",
  "per_session",
  "per_session_unverified",
  "label",
  "unverified",
]);

function base(
  state: DeadlineState,
  fields: Partial<DeadlinePresentation> & { card: string },
): DeadlinePresentation {
  return {
    state,
    row: fields.card,
    detail: fields.card,
    detailCaption: null,
    detailAside: null,
    detailNote: null,
    stamp: null,
    dday: null,
    statusTag: "접수 중",
    tone: "default",
    closedOn: null,
    homeAlert: false,
    pushAlert: false,
    showOnHome: state !== "closed",
    recommendable: RECOMMENDABLE.has(state),
    ...fields,
  };
}

function closed(
  endMoment: SeoulMoment | null,
  today: SeoulMoment,
): DeadlinePresentation {
  const closedOn = endMoment ? `${endMoment.month}월 ${endMoment.day}일` : null;
  const card = endMoment ? `${shortDate(endMoment, today)} 마감` : "접수 종료";
  return base("closed", {
    card,
    row: card,
    detail: closedOn
      ? `이 공고는 ${closedOn}에 접수가 끝났어요`
      : "이 공고는 접수가 끝났어요",
    statusTag: "접수 종료",
    tone: "muted",
    closedOn,
  });
}

function withoutApplied(input: DeadlineInput): DeadlinePresentation {
  const nowTime = (input.now ?? new Date()).getTime();
  const today = seoul(nowTime);
  const kind = kindOf(input.deadlineType);
  const status = input.deadlineStatus ?? "unverified";
  const endTime = parse(input.applicationEndAt);
  const end = endTime === null ? null : seoul(endTime);
  const eventEnd = parse(input.eventEndAt);
  const eventEnded =
    eventEnd !== null && seoul(eventEnd).ordinal < today.ordinal;
  const note = input.deadlineNote?.trim() || null;

  const fixedVerified = kind === "fixed" && status === "verified" && end;
  const timeVerified = Boolean(fixedVerified && input.deadlineTimeVerified);
  // A verified 00:00 ends the day before: "11.12 00:00" reads "11.11(수) 밤
  // 12시까지", and the D-day, stamp and closing follow 11.11.
  const shownEnd =
    timeVerified && end!.hour === 0 && end!.minute === 0
      ? seoul(endTime! - 1)
      : end;

  // 2. Reception is over.
  if (input.posterStatus === "closed")
    return closed(shownEnd && endTime! <= nowTime ? shownEnd : null, today);
  if (fixedVerified) {
    const over = timeVerified
      ? nowTime > endTime!
      : today.ordinal > end!.ordinal;
    if (over) return closed(shownEnd, today);
  }

  // Not open yet (kept as before, SPEC 12장 B), judged by the Seoul date.
  const startTime = parse(input.applicationStartAt, false);
  if (startTime !== null && seoul(startTime).ordinal > today.ordinal)
    return base("scheduled", { card: "접수 예정", statusTag: "접수 예정" });

  // 3·4. A verified fixed deadline, with or without a verified time.
  if (fixedVerified) {
    const days = shownEnd!.ordinal - today.ordinal;
    const stamp = stampFor(days);
    const date = dateLabel(shownEnd!, today);
    const suffix = stamp ? "" : ` · D-${days}`;
    const aside = days === 0 ? "오늘" : `D-${days}`;
    if (timeVerified) {
      const midnight = shownEnd !== end;
      const long = `${date} ${midnight ? "밤 12시" : spokenTime(end!)}까지`;
      return base("verified_time", {
        card: midnight ? long : `${date} ${cardTime(end!)}까지`,
        row: long + suffix,
        detail: long,
        detailAside: aside,
        detailNote: note,
        stamp,
        dday: days,
        homeAlert: days >= 0 && days <= 3,
        pushAlert: days >= 0 && days <= 3,
      });
    }
    const card = days === 0 ? "오늘이 마감일 · 시각 확인" : `${date}까지`;
    return base("date_only", {
      card,
      row: days === 0 ? card : `${date}까지${suffix}`,
      detail: `${date}까지`,
      detailCaption: "마감 시각은 공고문에서 확인",
      detailAside: aside,
      detailNote: note,
      stamp,
      dday: days,
      homeAlert: days >= 0 && days <= 3,
      // Without a time, a reminder on the last day could arrive too late.
      pushAlert: days >= 1 && days <= 3,
    });
  }

  // 5. Each session closes on its own; the last date is not the deadline.
  if (kind === "per_session") {
    const last = parse(input.lastSessionDeadlineDate);
    const lastMoment = last === null ? null : seoul(last);
    if (lastMoment && lastMoment.ordinal < today.ordinal)
      return closed(lastMoment, today);
    if (eventEnded) return closed(null, today);
    const aside = lastMoment
      ? `마지막 접수 ${dateLabel(lastMoment, today)}`
      : null;
    const rule = input.sessionRuleText?.trim();
    if (input.sessionRuleVerified && rule)
      return base("per_session", {
        card: rule,
        detail: rule,
        detailAside: aside,
        detailNote: note,
      });
    return base("per_session_unverified", {
      card: "회차별 접수 조건 확인",
      row: "회차별 접수 조건은 신청 페이지에서 확인",
      detail: "신청 페이지에서 확인",
      detailNote: note,
      tone: "muted",
    });
  }

  // 6. Until full, or recurring / always open: wording only.
  if (kind === "until_exhausted" || kind === "ongoing") {
    if (end && end.ordinal < today.ordinal) return closed(end, today);
    if (eventEnded) return closed(null, today);
    const label = input.deadlineLabel?.trim() || LABEL_DEFAULT[kind];
    return base("label", { card: label, detailNote: note });
  }

  // 7. Anything else: no date, an unverified date or sources that disagree.
  if (eventEnded) return closed(null, today);
  const pastUnverifiedDate = end !== null && end.ordinal < today.ordinal;
  if (input.receptionVerified && !pastUnverifiedDate)
    return base("unverified", {
      card: "마감일은 공고문에서 확인",
      detail: "공고문에서 확인",
      detailCaption:
        status === "conflict" ? CONFLICT_CAPTION : UNVERIFIED_CAPTION,
      detailNote: note,
      tone: "muted",
    });
  return base("reception_unknown", {
    card: "접수 여부 확인",
    detail: "공고문에서 확인",
    statusTag: "접수 여부 확인",
    tone: "muted",
    // Probably over, but not confirmed: kept off the home and suggestions.
    showOnHome: !pastUnverifiedDate,
  });
}

/**
 * "11.12(목) 오후 3시" with the same date and time rules (SPEC 4.4), e.g. the
 * confirmed 선정 안내 time after applying. Null when the value is unusable.
 */
export function spokenDateTime(
  value: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const time = parse(value, false);
  if (time === null) return null;
  const moment = seoul(time);
  return `${dateLabel(moment, seoul(now.getTime()))} ${spokenTime(moment)}`;
}

export function getDeadlinePresentation(
  input: DeadlineInput,
): DeadlinePresentation {
  const shown = withoutApplied(input);
  // 1. The viewer's own mark overrides the wording, never the poster's status.
  if (!input.applied) return shown;
  return {
    ...shown,
    state: "applied",
    card: "신청했어요",
    row: "신청했어요",
    detailAside: null,
    stamp: null,
    dday: null,
    tone: "applied",
    homeAlert: false,
    pushAlert: false,
  };
}
