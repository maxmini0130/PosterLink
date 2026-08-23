export const POSTER_TIME_ZONE = "Asia/Seoul";

export type PosterDeadlineType =
  | "fixed"
  | "ongoing"
  | "until_exhausted"
  | "scheduled"
  | "unknown";
export type PosterApplicationStatus =
  | "scheduled"
  | "open"
  | "closing_soon"
  | "due_today"
  | "ongoing"
  | "until_exhausted"
  | "closed"
  | "needs_confirmation";

export type PosterApplicationState = {
  status: PosterApplicationStatus;
  label: string;
  daysLeft: number | null;
};

export type PosterApplicationInput = {
  applicationStartAt?: string | null;
  applicationEndAt?: string | null;
  deadlineType?: string | null;
  now?: Date;
};

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: POSTER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseTime(value?: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function dateOrdinal(time: number) {
  const parts = Object.fromEntries(
    datePartsFormatter
      .formatToParts(new Date(time))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000,
  );
}

export function normalizePosterDeadlineType(
  value?: string | null,
): PosterDeadlineType {
  switch (
    String(value ?? "")
      .trim()
      .toLowerCase()
  ) {
    case "fixed":
    case "고정":
      return "fixed";
    case "ongoing":
    case "상시":
      return "ongoing";
    case "until_exhausted":
    case "소진시":
    case "소진 시":
      return "until_exhausted";
    case "scheduled":
    case "예정":
      return "scheduled";
    default:
      return "unknown";
  }
}

export function getPosterApplicationState(input: PosterApplicationInput): PosterApplicationState {
  const nowTime = (input.now ?? new Date()).getTime();
  const startTime = parseTime(input.applicationStartAt);
  const endTime = parseTime(input.applicationEndAt);
  const invalidStart = Boolean(input.applicationStartAt && startTime === null);
  const invalidEnd = Boolean(input.applicationEndAt && endTime === null);

  if (invalidStart || invalidEnd) {
    return {
      status: "needs_confirmation",
      label: "기관 확인 필요",
      daysLeft: null,
    };
  }

  const today = dateOrdinal(nowTime);
  const startDay = startTime === null ? null : dateOrdinal(startTime);
  const endDay = endTime === null ? null : dateOrdinal(endTime);

  if (startDay !== null && startDay > today) {
    return { status: "scheduled", label: "모집 예정", daysLeft: null };
  }

  if (endDay !== null) {
    const daysLeft = endDay - today;
    if (daysLeft < 0) return { status: "closed", label: "마감됨", daysLeft };
    if (daysLeft === 0)
      return { status: "due_today", label: "오늘 마감", daysLeft };
    if (daysLeft <= 3)
      return { status: "closing_soon", label: "마감 임박", daysLeft };
    return { status: "open", label: "신청 가능", daysLeft };
  }

  switch (normalizePosterDeadlineType(input.deadlineType)) {
    case "ongoing":
      return { status: "ongoing", label: "상시 모집", daysLeft: null };
    case "until_exhausted":
      return {
        status: "until_exhausted",
        label: "소진 시 마감",
        daysLeft: null,
      };
    case "scheduled":
      return { status: "scheduled", label: "모집 예정", daysLeft: null };
    default:
      return {
        status: "needs_confirmation",
        label: "일정 확인 필요",
        daysLeft: null,
      };
  }
}

export function isPosterAcceptingApplications(input: PosterApplicationInput) {
  const state = getPosterApplicationState(input);
  return (
    state.status === "open" ||
    state.status === "closing_soon" ||
    state.status === "due_today" ||
    state.status === "ongoing" ||
    state.status === "until_exhausted"
  );
}

export function formatPosterDate(value?: string | null) {
  const time = parseTime(value);
  if (time === null) return null;
  const parts = Object.fromEntries(
    datePartsFormatter
      .formatToParts(new Date(time))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}.${parts.month}.${parts.day}`;
}

export function formatPosterDateTime(value?: string | null) {
  const time = parseTime(value);
  if (time === null) return null;
  const timeLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: POSTER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(time));
  return `${formatPosterDate(value)} ${timeLabel}`;
}

export function formatApplicationPeriod(input: {
  applicationStartAt?: string | null;
  applicationEndAt?: string | null;
  deadlineType?: string | null;
}) {
  const startLabel = formatPosterDate(input.applicationStartAt);
  const endLabel = formatPosterDate(input.applicationEndAt);
  const hasInvalidDate =
    Boolean(input.applicationStartAt && !startLabel) ||
    Boolean(input.applicationEndAt && !endLabel);
  const deadlineType = normalizePosterDeadlineType(input.deadlineType);

  if (hasInvalidDate) return "기관 공고 확인 필요";
  if (startLabel && endLabel) return `${startLabel} ~ ${endLabel}`;
  if (endLabel) return `${endLabel}까지`;
  if (deadlineType === "ongoing")
    return startLabel ? `${startLabel}부터 상시 모집` : "상시 모집";
  if (deadlineType === "until_exhausted")
    return startLabel ? `${startLabel}부터 소진 시까지` : "소진 시까지";
  if (deadlineType === "scheduled")
    return startLabel ? `${startLabel} 모집 예정` : "모집 일정 발표 예정";
  if (startLabel) return `${startLabel}부터 · 종료 일정 확인 필요`;
  return "일정 확인 필요";
}
