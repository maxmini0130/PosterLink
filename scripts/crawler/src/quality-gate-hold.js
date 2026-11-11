/**
 * Per-poster quality gate hold (2026-11-11).
 *
 * The daily quality gate used to fail the whole run when any public poster
 * had a problem. Now each published poster with a problem is sent back to the
 * review queue on its own and the run passes. The run still fails when the
 * number of posters to hold is abnormally large (a model outage, a bad
 * backfill): then nothing is written.
 *
 * Reasons (all only for published posters; a review poster already waits for
 * a person and is not public):
 *   image_low / image_unscored  image check with a low or missing model score
 *                               (rules in image-confidence-hold.js)
 *   public_nonposter            image check says the image is not a poster
 *   nonposter_reject            the poster quality gate would reject it
 *                               (same check as cleanup-review-nonposters.js)
 *   field_correction            a high-confidence deadline correction is
 *                               pending (same check as
 *                               apply-field-verification-corrections.js)
 *
 * A person's decision is not overridden:
 *   - after a hold, a person who publishes the poster again releases it, for
 *     the same finding (a newer finding is judged again);
 *   - a recorded person review (a direct source review with a reviewer) made
 *     on or after the finding means the finding was already looked at: the
 *     poster is skipped and counted separately, like manual image reviews.
 *
 * Pure functions; the CLI is hold-quality-gate-posters.js.
 */
import { evaluatePosterQuality } from "./poster-quality-gate.js";
import { getCorrection } from "./apply-field-verification-corrections.js";
import {
  imageClassificationOf,
  imageConfidenceHoldOf,
  planImageConfidenceHold,
  holdReasonText as imageHoldReasonText,
  withImageConfidenceHold,
  releasedByPerson as imageReleasedByPerson,
} from "./image-confidence-hold.js";

export const QUALITY_GATE_HOLD_RULES = "quality-gate-hold-20261111";
export const FIELD_CORRECTION_MIN_CONFIDENCE = 0.85;

export const HOLD_REASON_TEXT = Object.freeze({
  public_nonposter: "이미지 판정: 포스터·안내문이 아님",
  nonposter_reject: "품질 검사에서 제외 대상으로 판정",
  field_correction: "마감일 정정 후보가 있음(원문과 저장값이 다름)",
});

// Keys under field_verification written by a direct review a person ran or
// ordered (source reviews, follow-ups, corrections). The AI review queue
// (aiQueueReview) is a model and does not count.
const PERSON_REVIEW_KEY =
  /(?:sourceReview|SourceReview|DeepReview|FollowupReview|humanReview|remainingReview|dateReview|manualCorrection)/;
const MODEL_REVIEWER = /(?:ai[-_ ]?queue|gpt|openai)/i;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function time(value) {
  const t = Date.parse(value ?? "");
  return Number.isFinite(t) ? t : null;
}

export function isPublicExposureTier(value) {
  return value === null || value === undefined || value === "A" || value === "B";
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

function personReviewedSince(fieldVerification, findingAt) {
  const findingTime = time(findingAt);
  if (findingTime === null) return false;
  const reviewed = lastPersonReviewAt(fieldVerification);
  return reviewed !== null && reviewed >= findingTime;
}

/** Findings other than image confidence, each with a fingerprint and the time it was made. */
export function qualityFindings(row) {
  const fv = asObject(row?.field_verification);
  const findings = [];
  const cls = imageClassificationOf(fv);
  const publicTier = isPublicExposureTier(row?.exposure_tier);

  if (row?.thumbnail_url && publicTier && cls?.isPoster === false) {
    findings.push({
      code: "public_nonposter",
      fingerprint: `cls:${cls.checkedAt ?? ""}`,
      findingAt: cls.checkedAt ?? null,
      detail: String(cls.reason ?? "").slice(0, 200),
    });
  }

  if (publicTier && row?.source_key) {
    const quality = evaluatePosterQuality({
      ...row,
      images: row.thumbnail_url ? [row.thumbnail_url] : [],
    });
    if (quality.decision === "reject") {
      const codes = (quality.issues ?? [])
        .filter((issue) => issue.decision === "reject")
        .map((issue) => issue.code)
        .sort();
      findings.push({
        code: "nonposter_reject",
        fingerprint: `issues:${codes.join(",")}|cls:${cls?.checkedAt ?? ""}`,
        findingAt: cls?.checkedAt ?? fv.checkedAt ?? null,
        detail: codes.join(", "),
      });
    }
  }

  const correction = getCorrection(row, FIELD_CORRECTION_MIN_CONFIDENCE);
  if (correction?.changes?.length) {
    findings.push({
      code: "field_correction",
      fingerprint: correction.changes
        .map((change) => `${change.field}:${change.next}`)
        .join("|"),
      findingAt: fv.checkedAt ?? null,
      detail: correction.changes
        .map((change) => `${change.field} ${change.old ?? "-"} → ${change.next}`)
        .join(", "),
    });
  }
  return findings;
}

/** The hold this gate left on the poster, if any. */
export function qualityGateHoldOf(fieldVerification) {
  const hold = asObject(fieldVerification).qualityGateHold;
  return hold && typeof hold === "object" && typeof hold.heldAt === "string"
    ? hold
    : null;
}

function releasedFinding(row, finding) {
  const hold = qualityGateHoldOf(row?.field_verification);
  if (!hold) return false;
  const publishedAt = time(row?.published_at);
  const heldAt = time(hold.heldAt);
  return (
    publishedAt !== null &&
    heldAt !== null &&
    publishedAt > heldAt &&
    (hold.reasons ?? []).some(
      (reason) =>
        reason.code === finding.code && reason.fingerprint === finding.fingerprint,
    )
  );
}

/**
 * What the gate does with one poster:
 * { action: "hold" | "skip", reasons: [...], skipped: [{code, why}] }.
 */
export function planQualityGateHold(row) {
  const reasons = [];
  const skipped = [];
  if (row?.poster_status !== "published") {
    return { action: "skip", reasons, skipped, notPublished: true };
  }

  const image = planImageConfidenceHold(row);
  if (image.action === "hold") {
    reasons.push({
      code: `image_${image.reason}`,
      text: imageHoldReasonText(image),
      fingerprint: `cls:${image.checkedAt ?? ""}`,
      image,
    });
  } else if (image.reason === "released_by_person" || image.reason === "manual") {
    skipped.push({ code: "image_confidence", why: image.reason });
  }

  for (const finding of qualityFindings(row)) {
    if (releasedFinding(row, finding)) {
      skipped.push({ code: finding.code, why: "released_by_person" });
    } else if (personReviewedSince(row.field_verification, finding.findingAt)) {
      skipped.push({ code: finding.code, why: "person_reviewed" });
    } else {
      reasons.push({
        code: finding.code,
        text: `${HOLD_REASON_TEXT[finding.code]}${finding.detail ? ` — ${finding.detail}` : ""}`,
        fingerprint: finding.fingerprint,
      });
    }
  }
  return { action: reasons.length ? "hold" : "skip", reasons, skipped };
}

/** field_verification with the hold recorded; nothing else is changed. */
export function withQualityGateHold(fieldVerification, plan, { now, runId = null }) {
  let fv = asObject(fieldVerification);
  const imageReason = plan.reasons.find((reason) => reason.image);
  if (imageReason) fv = withImageConfidenceHold(fv, imageReason.image, { now, runId });
  return {
    ...fv,
    qualityGateHold: {
      rules: QUALITY_GATE_HOLD_RULES,
      reasons: plan.reasons.map(({ code, text, fingerprint }) => ({
        code,
        text,
        fingerprint,
      })),
      previousStatus: "published",
      heldAt: now,
      runId,
    },
  };
}

/** True while a hold waits for a person (blocks automatic approval). */
export function hasActiveQualityGateHold(row) {
  const fv = row?.field_verification;
  if (imageConfidenceHoldOf(fv) && !imageReleasedByPerson(row)) return true;
  const hold = qualityGateHoldOf(fv);
  if (!hold) return false;
  const publishedAt = time(row?.published_at);
  return !(publishedAt !== null && publishedAt > time(hold.heldAt));
}

/** Counts for the healthcheck and the dry-run report. */
export function summarizeQualityGate(rows) {
  const byReason = {};
  const skippedByReason = {};
  let holds = 0;
  const sample = [];
  for (const row of rows) {
    const plan = planQualityGateHold(row);
    for (const skip of plan.skipped) {
      const key = `${skip.code}:${skip.why}`;
      skippedByReason[key] = (skippedByReason[key] ?? 0) + 1;
    }
    if (plan.action !== "hold") continue;
    holds += 1;
    for (const reason of plan.reasons) {
      byReason[reason.code] = (byReason[reason.code] ?? 0) + 1;
    }
    if (sample.length < 10) {
      sample.push({
        id: row.id,
        title: row.title,
        reasons: plan.reasons.map((reason) => reason.code),
      });
    }
  }
  return { public_needs_hold: holds, by_reason: byReason, skipped: skippedByReason, sample };
}
