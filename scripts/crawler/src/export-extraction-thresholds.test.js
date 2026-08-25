import assert from "node:assert/strict";
import test from "node:test";

import {
  buildThresholdPlan,
  renderThresholdModule,
} from "./export-extraction-thresholds.js";

test("buildThresholdPlan exports ready recommendations from an evaluation report", () => {
  const plan = buildThresholdPlan({
    generated_at: "2026-08-25T00:00:00.000Z",
    set: "eval/golden",
    extractor: "current",
    labeled_posters: 120,
    labeled_field_count: 240,
    field_metrics: {
      deadline_date: {
        labeled: 120,
        recommended_threshold: {
          threshold: 0.85,
          precision: 0.99,
          coverage: 0.8,
          predictions: 96,
        },
      },
    },
  }, { minLabeled: 100 });

  assert.equal(plan.production_ready, false);
  assert.equal(plan.fields.deadline_date.status, "ready");
  assert.equal(plan.fields.deadline_date.threshold, 0.85);
  assert.equal(plan.thresholds.deadline_date, 0.85);
  assert.equal(plan.fields.category.status, "missing_recommendation");
  assert.equal(plan.thresholds.category, 0.8);
  assert.ok(plan.blocking_reasons.includes("one_or_more_fields_missing_recommendation"));
});

test("buildThresholdPlan blocks production use when the report is unlabeled", () => {
  const plan = buildThresholdPlan({
    labeled_posters: 0,
    field_metrics: {},
  }, { minLabeled: 120 });

  assert.equal(plan.production_ready, false);
  assert.deepEqual(plan.blocking_reasons, [
    "labeled_posters_below_120",
    "one_or_more_fields_missing_recommendation",
  ]);
  assert.equal(plan.thresholds.official_url, 0.9);
});

test("renderThresholdModule creates a copyable candidate module", () => {
  const plan = buildThresholdPlan({
    generated_at: "2026-08-25T00:00:00.000Z",
    extractor: "current",
    labeled_posters: 0,
    field_metrics: {},
  });
  const moduleText = renderThresholdModule(plan, {
    reportPath: "data/eval/reports/extraction-empty.json",
  });

  assert.match(moduleText, /Generated from data\/eval\/reports\/extraction-empty\.json/);
  assert.match(moduleText, /EXTRACTION_THRESHOLDS_CANDIDATE/);
  assert.match(moduleText, /"production_ready": false/);
});
