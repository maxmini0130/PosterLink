/**
 * Review-queue cleanup hold (2026-11-19).
 *
 * cleanup-review-nonposters.js used to set poster_status = "rejected" for every
 * review row the current quality gate rejects. On 2026-11-19 the user reviewed
 * the rejected list: only duplicates should be rejected. The cleanup had
 * removed real notices (a facility rental guide for a weak summary, a job fair
 * whose real poster the image model misread). Rejection is now a person's
 * decision.
 *
 * Instead the row stays in review with:
 *   - the quality issues merged into field_verification.qualityIssues (shown as
 *     warnings on the admin review screen), and
 *   - a qualityGateHold, which blocks automatic approval by the AI queue
 *     (hasActiveQualityGateHold) until a person publishes it.
 * Running again with the same findings writes nothing.
 */
import { summarizeQualityIssues } from "./poster-quality-gate.js";

export const REVIEW_CLEANUP_HOLD_RULES = "review-cleanup-hold-20261119";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rejectCodes(quality) {
  return [...new Set((quality?.issues ?? [])
    .filter((issue) => issue.decision === "reject")
    .map((issue) => issue.code))]
    .sort();
}

export function cleanupFingerprint(quality) {
  return `issues:${rejectCodes(quality).join(",")}`;
}

/**
 * True when nothing new would be written: the row already carries this
 * cleanup hold for the same findings, or another hold blocks it and the
 * reject findings are already recorded.
 */
export function hasSameCleanupHold(fieldVerification, quality) {
  const fv = asObject(fieldVerification);
  const hold = asObject(fv.qualityGateHold);
  if (hold.rules === REVIEW_CLEANUP_HOLD_RULES) {
    return (hold.reasons ?? []).some((reason) => reason.fingerprint === cleanupFingerprint(quality));
  }
  if (!hold.heldAt) return false;
  const recorded = new Set((Array.isArray(fv.qualityIssues) ? fv.qualityIssues : []).map((issue) => issue.code));
  return rejectCodes(quality).every((code) => recorded.has(code));
}

/** field_verification with the quality issues and the hold; status is not touched. */
export function withReviewCleanupHold(fieldVerification, quality, { now, runId = null }) {
  const fv = asObject(fieldVerification);
  const existing = Array.isArray(fv.qualityIssues) ? fv.qualityIssues : [];
  const next = (quality?.issues ?? []).map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    reason: issue.reason,
    evidence: issue.evidence,
    decision: issue.decision,
  }));
  const seen = new Set();
  const qualityIssues = [...existing, ...next].filter((issue) => {
    const key = `${issue.code}:${issue.evidence ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const base = {
    ...fv,
    qualityIssues,
    cleanup: { ...asObject(fv.cleanup), reviewNonposterCleanupAt: now },
  };
  // A hold from another rule (e.g. a published poster sent back by the daily
  // gate) already blocks automatic approval; keep its record untouched.
  const otherHold = asObject(fv.qualityGateHold);
  if (otherHold.heldAt && otherHold.rules !== REVIEW_CLEANUP_HOLD_RULES) return base;
  return {
    ...base,
    qualityGateHold: {
      rules: REVIEW_CLEANUP_HOLD_RULES,
      reasons: [{
        code: "review_cleanup",
        text: `품질 검사 제외 후보(사람 판단 필요) — ${summarizeQualityIssues(quality, 6)}`.slice(0, 500),
        fingerprint: cleanupFingerprint(quality),
      }],
      previousStatus: "review",
      heldAt: now,
      runId,
    },
  };
}
