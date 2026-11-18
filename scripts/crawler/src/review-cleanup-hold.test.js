import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_CLEANUP_HOLD_RULES,
  cleanupFingerprint,
  hasSameCleanupHold,
  withReviewCleanupHold,
} from "./review-cleanup-hold.js";
import { hasActiveQualityGateHold } from "./quality-gate-hold.js";

const quality = {
  decision: "reject",
  issues: [
    { code: "image-not-poster", severity: "high", reason: "AI classifier says image is not a poster", evidence: "cls", decision: "reject" },
    { code: "weak-summary", severity: "medium", reason: "summary is missing or too short", evidence: "", decision: "reject" },
    { code: "text-notice-no-image", severity: "low", reason: "no image", evidence: "", decision: "review" },
  ],
};
const NOW = "2026-11-19T01:00:00.000Z";

test("a reject finding becomes a hold, not a rejection, and blocks auto-approval", () => {
  const fv = withReviewCleanupHold({ reason: "crawler" }, quality, { now: NOW, runId: "123" });
  assert.equal(fv.decision, undefined, "decision must not be set to rejected");
  assert.equal(fv.qualityGateHold.rules, REVIEW_CLEANUP_HOLD_RULES);
  assert.equal(fv.qualityGateHold.previousStatus, "review");
  assert.equal(fv.qualityGateHold.reasons[0].fingerprint, "issues:image-not-poster,weak-summary");
  assert.deepEqual(fv.qualityIssues.map((i) => i.code), ["image-not-poster", "weak-summary", "text-notice-no-image"]);
  assert.equal(hasActiveQualityGateHold({ poster_status: "review", published_at: null, field_verification: fv }), true);
});

test("a person publishing after the hold releases it", () => {
  const fv = withReviewCleanupHold({}, quality, { now: NOW });
  assert.equal(hasActiveQualityGateHold({ published_at: "2026-11-19T02:00:00.000Z", field_verification: fv }), false);
});

test("the same findings are not written twice", () => {
  const fv = withReviewCleanupHold({}, quality, { now: NOW });
  assert.equal(hasSameCleanupHold(fv, quality), true);
  const other = { ...quality, issues: [{ code: "facility-use", decision: "reject" }] };
  assert.equal(hasSameCleanupHold(fv, other), false);
  assert.equal(cleanupFingerprint(other), "issues:facility-use");
});

test("an existing hold from another rule is kept", () => {
  const prior = {
    qualityGateHold: { rules: "quality-gate-hold-20261111", reasons: [{ code: "image_low" }], previousStatus: "published", heldAt: "2026-11-18T00:00:00.000Z" },
  };
  const fv = withReviewCleanupHold(prior, quality, { now: NOW });
  assert.deepEqual(fv.qualityGateHold, prior.qualityGateHold);
  assert.ok(fv.qualityIssues.length > 0);
  assert.equal(hasSameCleanupHold(fv, quality), true);
});
