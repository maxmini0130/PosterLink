import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HEALTHCHECK_THRESHOLDS,
  evaluateHealthcheckGates,
} from "./ai-healthcheck-gates.js";

function passingSummary(overrides = {}) {
  return {
    embedding_coverage_percent: 100,
    field_verification_coverage_percent: 48.2,
    image_ai_coverage_percent: 20.4,
    review_queue_reject_candidates: 0,
    image_ai_public_nonposter_count: 0,
    image_ai_low_confidence_count: 0,
    application_source_key_count: 0,
    field_correction_candidates: 0,
    public_nonposter_reject_candidates: 0,
    ...overrides,
  };
}

test("current operating baseline passes the default quality gate", () => {
  const result = evaluateHealthcheckGates(passingSummary());

  assert.equal(result.passed, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.thresholds, DEFAULT_HEALTHCHECK_THRESHOLDS);
});

test("application-form sources and correction candidates fail the gate", () => {
  const result = evaluateHealthcheckGates(
    passingSummary({
      application_source_key_count: 1,
      field_correction_candidates: 2,
    }),
  );

  assert.equal(result.passed, false);
  assert.deepEqual(
    result.violations.map((violation) => violation.metric),
    ["application_source_key_count", "field_correction_candidates"],
  );
});

test("coverage below its floor fails while the exact boundary passes", () => {
  const failed = evaluateHealthcheckGates(
    passingSummary({ image_ai_coverage_percent: 19.9 }),
  );
  const passed = evaluateHealthcheckGates(
    passingSummary({
      embedding_coverage_percent: 99,
      field_verification_coverage_percent: 45,
      image_ai_coverage_percent: 20,
    }),
  );

  assert.equal(failed.passed, false);
  assert.equal(failed.violations[0].metric, "image_ai_coverage_percent");
  assert.equal(passed.passed, true);
});

test("missing metrics cannot silently pass the gate", () => {
  const summary = passingSummary();
  delete summary.application_source_key_count;

  const result = evaluateHealthcheckGates(summary);

  assert.equal(result.passed, false);
  assert.equal(result.violations[0].metric, "application_source_key_count");
  assert.equal(result.violations[0].reason, "missing-or-invalid-metric");
});
