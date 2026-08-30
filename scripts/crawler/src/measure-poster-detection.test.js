import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePosterDetectionPlan } from "./measure-poster-detection.js";

function buildDecision({ isRealPoster, route = "rule_accept", needsVlm = false }) {
  return {
    isRealPoster,
    route,
    needsVlm,
  };
}

test("evaluatePosterDetectionPlan computes precision/recall and routing metrics", () => {
  const plans = [
    { truth_is_real_poster: true, decision: buildDecision({ isRealPoster: true, route: "rule_accept" }) },
    { truth_is_real_poster: true, decision: buildDecision({ isRealPoster: false, route: "needs_vlm" , needsVlm: true }) },
    { truth_is_real_poster: false, decision: buildDecision({ isRealPoster: false, route: "reject" }) },
    { truth_is_real_poster: false, decision: buildDecision({ isRealPoster: null, route: "needs_vlm", needsVlm: true }) },
  ];

  const report = evaluatePosterDetectionPlan(plans);
  assert.equal(report.total, 4);
  assert.equal(report.classified, 3);
  assert.equal(report.abstained, 1);
  assert.equal(report.tp, 1);
  assert.equal(report.fn, 1);
  assert.equal(report.fp, 0);
  assert.equal(report.tn, 1);
  assert.equal(report.precision, 1);
  assert.equal(report.recall, 1 / 2);
  assert.equal(report.precision_by_coverage, 3 / 4);
  assert.equal(report.needs_vlm, 2);
  assert.equal(report.vlm_savings_rate, 0.5);
  assert.equal(report.routeStats.rule_accept, 1);
  assert.equal(report.routeStats.reject, 1);
  assert.equal(report.routeStats.needs_vlm, 2);
});
