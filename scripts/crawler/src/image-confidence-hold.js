/**
 * Per-poster image confidence hold (quality gate, 2026-11-11).
 *
 * A published poster whose image check is low confidence, or carries no
 * confidence at all from a model, is sent back to the review queue on its
 * own. The daily run no longer fails for it.
 *
 * States of the stored image check (posterImageOcr / attachmentPosterRepair
 * .imageClassification):
 *   none      no check recorded
 *   ok        model confidence >= 0.55
 *   low       model confidence < 0.55
 *   unscored  no confidence and no manual-review source: treated as unknown,
 *             never as 0 and never as passed
 *   manual    no confidence, written by a recorded manual visual review
 *             (e.g. source "codex-visual-inspection" from the direct source
 *             reviews): a person's decision, not a model score
 *
 * A hold is not repeated once a person approved the poster again after it
 * (published_at later than the hold) for the same image check. Pure functions;
 * the CLI is hold-quality-gate-posters.js.
 */

export const IMAGE_CONFIDENCE_HOLD_RULES = "image-confidence-hold-20261111";
export const LOW_IMAGE_CONFIDENCE = 0.55;

const MANUAL_REVIEW_SOURCE = /(?:visual-inspection|manual|human|admin)/i;

export function imageClassificationOf(fieldVerification) {
  const fv =
    fieldVerification && typeof fieldVerification === "object"
      ? fieldVerification
      : {};
  const value =
    fv.posterImageOcr?.imageClassification ??
    fv.attachmentPosterRepair?.imageClassification ??
    null;
  return value && typeof value === "object" ? value : null;
}

export function imageConfidenceState(fieldVerification) {
  const cls = imageClassificationOf(fieldVerification);
  if (!cls) return { state: "none" };
  const raw = cls.confidence;
  const confidence =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))
        ? Number(raw)
        : null;
  const base = {
    confidence,
    source: typeof cls.source === "string" ? cls.source : null,
    model: typeof cls.model === "string" ? cls.model : null,
    isPoster: typeof cls.isPoster === "boolean" ? cls.isPoster : null,
    checkedAt: typeof cls.checkedAt === "string" ? cls.checkedAt : null,
  };
  if (confidence !== null)
    return { ...base, state: confidence < LOW_IMAGE_CONFIDENCE ? "low" : "ok" };
  if (base.source && !base.model && MANUAL_REVIEW_SOURCE.test(base.source))
    return { ...base, state: "manual" };
  return { ...base, state: "unscored" };
}

function time(value) {
  const t = Date.parse(value ?? "");
  return Number.isFinite(t) ? t : null;
}

/** The hold this gate left on the poster, if any. */
export function imageConfidenceHoldOf(fieldVerification) {
  const hold = fieldVerification?.imageConfidenceHold;
  return hold && typeof hold === "object" && typeof hold.heldAt === "string"
    ? hold
    : null;
}

/**
 * True when a person approved the poster after the hold, for the image check
 * the hold was about. A newer image check is judged again.
 */
export function releasedByPerson(row) {
  const hold = imageConfidenceHoldOf(row?.field_verification);
  if (!hold) return false;
  const publishedAt = time(row?.published_at);
  const heldAt = time(hold.heldAt);
  const state = imageConfidenceState(row?.field_verification);
  return (
    publishedAt !== null &&
    heldAt !== null &&
    publishedAt > heldAt &&
    (hold.classificationCheckedAt ?? null) === (state.checkedAt ?? null)
  );
}

/** True while a hold waits for a person (blocks automatic approval). */
export function hasActiveImageConfidenceHold(row) {
  return (
    Boolean(imageConfidenceHoldOf(row?.field_verification)) &&
    !releasedByPerson(row)
  );
}

/**
 * What the gate does with one poster: { action: "hold" | "skip", reason, ...state }.
 * Only published posters with an image are held.
 */
export function planImageConfidenceHold(row) {
  const state = imageConfidenceState(row?.field_verification);
  if (row?.poster_status !== "published")
    return { action: "skip", reason: "not_published", ...state };
  if (!row?.thumbnail_url)
    return { action: "skip", reason: "no_image", ...state };
  if (state.state !== "low" && state.state !== "unscored")
    return { action: "skip", reason: state.state, ...state };
  if (releasedByPerson(row))
    return { action: "skip", reason: "released_by_person", ...state };
  return { action: "hold", reason: state.state, ...state };
}

export function holdReasonText(plan) {
  return plan.reason === "low"
    ? `이미지 포스터 판정 신뢰도 ${plan.confidence} (< ${LOW_IMAGE_CONFIDENCE})`
    : "이미지 포스터 판정에 신뢰도 값이 없음(모델 판정 미확인)";
}

/** field_verification with the hold recorded; nothing else is changed. */
export function withImageConfidenceHold(
  fieldVerification,
  plan,
  { now, runId = null },
) {
  const fv =
    fieldVerification && typeof fieldVerification === "object"
      ? fieldVerification
      : {};
  return {
    ...fv,
    imageConfidenceHold: {
      rules: IMAGE_CONFIDENCE_HOLD_RULES,
      reason: plan.reason,
      reasonText: holdReasonText(plan),
      confidence: plan.confidence ?? null,
      threshold: LOW_IMAGE_CONFIDENCE,
      source: plan.source ?? null,
      model: plan.model ?? null,
      classificationCheckedAt: plan.checkedAt ?? null,
      previousStatus: "published",
      heldAt: now,
      runId,
    },
  };
}

/** Counts for the healthcheck: what is still public and needs a hold. */
export function summarizeImageConfidence(rows) {
  const out = {
    checked: 0,
    low: 0,
    unscored: 0,
    manual: 0,
    released_by_person: 0,
    public_needs_hold: 0,
    review_low_or_unscored: 0,
    public_needs_hold_sample: [],
  };
  for (const row of rows) {
    const plan = planImageConfidenceHold(row);
    if (plan.state === "none") continue;
    out.checked += 1;
    if (plan.state === "low") out.low += 1;
    if (plan.state === "unscored") out.unscored += 1;
    if (plan.state === "manual") out.manual += 1;
    if (plan.reason === "released_by_person") out.released_by_person += 1;
    if (plan.action === "hold") {
      out.public_needs_hold += 1;
      if (out.public_needs_hold_sample.length < 10)
        out.public_needs_hold_sample.push({
          id: row.id,
          title: row.title,
          reason: plan.reason,
          confidence: plan.confidence,
        });
    }
    if (
      row.poster_status === "review" &&
      (plan.state === "low" || plan.state === "unscored")
    )
      out.review_low_or_unscored += 1;
  }
  return out;
}
