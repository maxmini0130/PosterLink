// Date helpers for review-current-queue-with-ai.js.
// Stored timestamps come back from Supabase in UTC, so a KST midnight start such as
// 2026-11-23T00:00+09:00 reads as "2026-11-22T15:00:00+00:00". Cutting that string
// shifted dates one day earlier, and writing every approved date back as 00:00 or
// 23:59:59 KST erased verified times such as an 18:00 deadline.

const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Deadline types the model may choose. The schema also allows per_session and scheduled,
// which the model never returns; those are kept when the reviewed dates do not change.
export const MODEL_DEADLINE_TYPES = ["fixed", "ongoing", "until_exhausted", "unknown"];
const STORED_DEADLINE_TYPES = new Set([...MODEL_DEADLINE_TYPES, "per_session", "scheduled"]);
export const DATE_FIELDS = ["application_start_at", "application_end_at", "event_start_at", "event_end_at"];

// The Asia/Seoul calendar date (YYYY-MM-DD) of a stored timestamp or a model date.
export function kstDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const time = Date.parse(text);
  if (!Number.isNaN(time)) return KST_DATE.format(new Date(time));
  const match = text.match(/20\d{2}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function storedDates(row) {
  return Object.fromEntries(DATE_FIELDS.map((field) => [field, kstDate(row?.[field])]));
}

// Keep the stored timestamp when the reviewed date is the same day; otherwise use the
// start or end of that KST day.
export function timestampForReviewedDate(stored, date, field) {
  if (!date) return null;
  if (stored && kstDate(stored) === date) return stored;
  return field.endsWith("_end_at") ? `${date}T23:59:59+09:00` : `${date}T00:00:00+09:00`;
}

// A passed deadline (or event, when there is no deadline) always closes the poster,
// whatever status the model returned.
export function deriveReviewStatus(decision, todayKst) {
  const end = decision.application_end_at ?? decision.event_end_at ?? decision.event_start_at;
  if (end && end < todayKst) return "closed";
  return decision.status === "closed" ? "closed" : "published";
}

export function reviewedDeadlineType(currentType, decidedType, datesUnchanged) {
  if (datesUnchanged && STORED_DEADLINE_TYPES.has(currentType) && !MODEL_DEADLINE_TYPES.includes(currentType)) {
    return currentType;
  }
  return MODEL_DEADLINE_TYPES.includes(decidedType) ? decidedType : "unknown";
}

// The update for the date columns. A changed deadline date no longer carries the
// stored verification, so it is marked unverified.
export function reviewedDateUpdate(row, decision) {
  const update = {};
  for (const field of DATE_FIELDS) {
    update[field] = timestampForReviewedDate(row?.[field], decision[field], field);
  }
  update.deadline_type = decision.deadline_type;
  if (kstDate(row?.application_end_at) !== decision.application_end_at) {
    update.deadline_status = "unverified";
    update.deadline_source = null;
    update.deadline_time_verified = false;
  }
  return update;
}
