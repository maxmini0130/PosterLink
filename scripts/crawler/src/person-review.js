/**
 * When a person last reviewed a poster, read from field_verification.
 *
 * Keys under field_verification written by a direct review a person ran or
 * ordered (source reviews, follow-ups, corrections) count. The AI review
 * queue (aiQueueReview) is a model and does not count; nor does any entry
 * whose reviewer names a model.
 *
 * Shared by quality-gate-hold.js and apply-field-verification-corrections.js
 * so both judge "already reviewed by a person" the same way.
 */
export const PERSON_REVIEW_KEY =
  /(?:sourceReview|SourceReview|DeepReview|FollowupReview|reviewFollowup|humanReview|remainingReview|dateReview|manualCorrection)/;
const MODEL_REVIEWER = /(?:ai[-_ ]?queue|gpt|openai)/i;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function time(value) {
  const t = Date.parse(value ?? "");
  return Number.isFinite(t) ? t : null;
}

function endOfSeoulDay(yyyymmdd) {
  const m = String(yyyymmdd ?? "").match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  return m ? time(`${m[1]}-${m[2]}-${m[3]}T23:59:59+09:00`) : null;
}

/**
 * Latest time a person reviewed this poster, or null. The review keys are
 * written only by direct reviews; the automatic AI queue writes aiQueueReview
 * (its reviewer field also says "codex", so the key decides). A date-only
 * stamp (todayKst, or the date in the key name such as sourceReview20261102)
 * counts as the end of that Seoul day.
 */
export function lastPersonReviewAt(fieldVerification) {
  let latest = null;
  for (const [key, value] of Object.entries(asObject(fieldVerification))) {
    if (!PERSON_REVIEW_KEY.test(key) || /^aiQueue/.test(key)) continue;
    const review = asObject(value);
    const who = review.reviewer ?? review.correctedBy;
    if (typeof who === "string" && MODEL_REVIEWER.test(who)) continue;
    const t =
      time(review.reviewedAt ?? review.correctedAt ?? review.checkedAt) ??
      endOfSeoulDay(review.todayKst) ??
      endOfSeoulDay(key.match(/(20\d{6})/)?.[1]);
    if (t !== null && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

/** True when a person reviewed the poster at or after `at`. */
export function personReviewedSince(fieldVerification, at) {
  const t = time(at);
  if (t === null) return false;
  const reviewed = lastPersonReviewAt(fieldVerification);
  return reviewed !== null && reviewed >= t;
}
