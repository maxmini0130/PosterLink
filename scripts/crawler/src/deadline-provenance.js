/**
 * Where a crawled deadline came from, and how much of it is confirmed
 * (v6.1 stage 2, user decision 2026-11-10).
 *
 * - A portal's structured application-period field confirms the date: 청년몽땅
 *   신청기간, 온통청년 신청 종료일, K-Startup 마감일자·접수기간, 기업마당 신청기간,
 *   잡알리오 채용기간.
 * - The time counts only when the field states one. 00:00 and 23:59:59 are what
 *   portals print for a date without a time, so they are not times.
 * - Every later step that can replace the value (external detail page,
 *   attachment suggestion, AI field verification, date-quality suggestion,
 *   structured-field parsing) is recorded. If the stored value no longer
 *   matches the portal field, the deadline goes back to unverified.
 */

export const DEADLINE_PROVENANCE_VERSION = "deadline-provenance/v1";

const SEOUL_OFFSET = "+09:00";

const seoulParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** A portal's placeholder for "no time": 00:00 or 23:59:59. */
export function isPlaceholderTime(hour, minute, second = 0) {
  return (
    (hour === 0 && minute === 0 && second === 0) ||
    (hour === 23 && minute === 59 && second === 59)
  );
}

const DATE_PATTERN =
  /(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?|(20\d{2})(\d{2})(\d{2})(?!\d)/g;
const TIME_PATTERN =
  /^[\s.)(월화수목금토일]*?(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?/;

/**
 * Reads the end of a portal deadline field, e.g. "2026-10-27 ~ 2026-11-10 14:00",
 * "신청기간 2026-10-26 ~ 2026-11-12 00 : 00", "20261110". Returns null when the
 * field has no date. `time` is "HH:MM" only when the field states a real time.
 */
export function readPortalDeadline(raw, { site, field } = {}) {
  const text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const tilde = text.lastIndexOf("~");
  const endText = tilde >= 0 ? text.slice(tilde + 1) : text;
  const matches = [...endText.matchAll(DATE_PATTERN)];
  const match = tilde >= 0 ? matches[0] : matches[matches.length - 1];
  if (!match) return null;
  const year = Number(match[1] ?? match[4]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[3] ?? match[6]);
  if (!validDate(year, month, day)) return null;
  const date = `${year}-${pad(month)}-${pad(day)}`;

  let time = null;
  const after = endText.slice(match.index + match[0].length);
  const timeMatch = after.match(TIME_PATTERN);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const second = Number(timeMatch[3] ?? 0);
    if (
      hour < 24 &&
      minute < 60 &&
      second < 60 &&
      !isPlaceholderTime(hour, minute, second)
    )
      time = `${pad(hour)}:${pad(minute)}`;
  }
  return {
    source: "portal",
    site: site ?? null,
    field: field ?? null,
    raw: text.slice(0, 200),
    date,
    time,
  };
}

/** The portal field as a stored deadline value. */
export function portalDeadlineIso(evidence) {
  if (!evidence?.date) return null;
  return evidence.time
    ? `${evidence.date}T${evidence.time}:00${SEOUL_OFFSET}`
    : `${evidence.date}T23:59:59${SEOUL_OFFSET}`;
}

/** { date: "YYYY-MM-DD", time: "HH:MM" | null } in Asia/Seoul; time null for a date-only value. */
export function seoulDeadlineParts(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return { date: text, time: null };
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  const parts = Object.fromEntries(
    seoulParts
      .formatToParts(new Date(parsed))
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: isPlaceholderTime(hour, minute, second)
      ? null
      : `${pad(hour)}:${pad(minute)}`,
  };
}

function sameValue(a, b) {
  const left = seoulDeadlineParts(a);
  const right = seoulDeadlineParts(b);
  if (!left || !right) return left === right;
  return left.date === right.date && left.time === right.time;
}

/**
 * The deadline at each step of one upload, oldest first, with repeated values
 * dropped. `steps` is [{ path, value }]; the first entry is what the adapter
 * produced (path = post.deadlineOrigin).
 */
export function deadlineTrail(steps) {
  const trail = [];
  for (const step of steps) {
    if (step.value == null || step.value === "") continue;
    const last = trail[trail.length - 1];
    if (last && sameValue(last.value, step.value)) continue;
    trail.push({ path: step.path, value: String(step.value) });
  }
  return trail;
}

/**
 * Decides the deadline columns for a new poster.
 *
 * Returns { applicationEndAt, columns, record }. `applicationEndAt` differs
 * from `finalValue` only when the portal field states a time that the
 * pipeline dropped (date-only value on the same date): the portal time is the
 * source's own value, so it is kept.
 */
export function decideDeadlineVerification({
  portal,
  steps = [],
  finalValue,
  now = new Date(),
}) {
  const trail = deadlineTrail(steps);
  const unverified = (reason) => ({
    applicationEndAt: finalValue ?? null,
    columns: {
      deadline_status: "unverified",
      deadline_source: null,
      deadline_time_verified: false,
      deadline_checked_at: now.toISOString(),
    },
    record: {
      version: DEADLINE_PROVENANCE_VERSION,
      portal: portal ?? null,
      trail,
      final: finalValue ?? null,
      status: "unverified",
      reason,
    },
  });

  if (!portal?.date)
    return unverified(finalValue ? "no-portal-field" : "no-deadline");
  const final = seoulDeadlineParts(finalValue);
  if (!final) return unverified("no-stored-deadline");
  if (final.date !== portal.date) return unverified("changed-after-portal");

  let applicationEndAt = finalValue;
  let timeVerified = false;
  let reason = "matches-portal-date";
  if (portal.time) {
    if (final.time === portal.time) {
      timeVerified = true;
      reason = "matches-portal-time";
    } else if (final.time === null) {
      applicationEndAt = portalDeadlineIso(portal);
      timeVerified = true;
      reason = "portal-time-restored";
    } else {
      return unverified("time-differs-from-portal");
    }
  }
  return {
    applicationEndAt,
    columns: {
      deadline_status: "verified",
      deadline_source: "portal",
      deadline_time_verified: timeVerified,
      deadline_checked_at: now.toISOString(),
    },
    record: {
      version: DEADLINE_PROVENANCE_VERSION,
      portal,
      trail,
      final: applicationEndAt,
      status: "verified",
      timeVerified,
      reason,
    },
  };
}

export const DEADLINE_VERIFICATION_POSTER_FIELDS = new Set([
  "deadline_status",
  "deadline_source",
  "deadline_time_verified",
  "deadline_checked_at",
]);

const DEADLINE_VERIFICATION_COLUMN_PATTERN =
  /\b(deadline_status|deadline_source|deadline_time_verified|deadline_checked_at)\b/;

/** Insert failed because 20261110010000 is not applied yet. */
export function isMissingDeadlineVerificationColumnError(error) {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return (
    DEADLINE_VERIFICATION_COLUMN_PATTERN.test(message) &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /column|schema cache/i.test(message))
  );
}

export function withoutDeadlineVerificationFields(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => !DEADLINE_VERIFICATION_POSTER_FIELDS.has(key),
    ),
  );
}
