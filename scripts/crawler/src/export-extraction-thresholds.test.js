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

  assert.equal(plan.production_ready, true);
  assert.equal(plan.fields.deadline_date.status, "ready");
  assert.equal(plan.fields.deadline_date.recommended_threshold, 0.85);
  assert.equal(plan.fields.deadline_date.threshold, 0.9);
  assert.equal(plan.thresholds.deadline_date, 0.9);
  assert.equal(plan.fields.category.status, "unlabeled");
  assert.equal(plan.thresholds.category, 0.8);
  assert.deepEqual(plan.blocking_reasons, []);
});

test("buildThresholdPlan blocks low-coverage recommendations", () => {
  const plan = buildThresholdPlan({
    labeled_posters: 120,
    field_metrics: {
      deadline_type: {
        labeled: 120,
        recommended_threshold: {
          threshold: 1,
          precision: 1,
          coverage: 0.2,
          predictions: 24,
        },
      },
    },
  }, { minLabeled: 100 });

  assert.equal(plan.production_ready, false);
  assert.equal(plan.fields.deadline_type.status, "low_coverage_recommendation");
  assert.equal(plan.fields.deadline_type.recommended_threshold, 1);
  assert.equal(plan.fields.deadline_type.threshold, 1);
  assert.equal(plan.thresholds.deadline_type, 1);
  assert.deepEqual(plan.blocking_reasons, ["one_or_more_labeled_fields_low_coverage_recommendation"]);
});

test("buildThresholdPlan can raise defaults when the recommendation is stricter and covered", () => {
  const plan = buildThresholdPlan({
    labeled_posters: 120,
    field_metrics: {
      category: {
        labeled: 120,
        recommended_threshold: {
          threshold: 0.9,
          precision: 0.95,
          coverage: 0.5,
          predictions: 60,
        },
      },
    },
  }, { minLabeled: 100 });

  assert.equal(plan.production_ready, true);
  assert.equal(plan.fields.category.status, "ready");
  assert.equal(plan.fields.category.recommended_threshold, 0.9);
  assert.equal(plan.fields.category.threshold, 0.9);
  assert.equal(plan.thresholds.category, 0.9);
});

test("buildThresholdPlan blocks when a labeled field lacks a recommendation", () => {
  const plan = buildThresholdPlan({
    labeled_posters: 120,
    labeled_field_count: 120,
    field_metrics: {
      deadline_date: {
        labeled: 120,
        recommended_threshold: {
          threshold: null,
          precision: null,
          coverage: null,
          predictions: 0,
        },
      },
    },
  }, { minLabeled: 100 });

  assert.equal(plan.production_ready, false);
  assert.equal(plan.fields.deadline_date.status, "missing_recommendation");
  assert.equal(plan.fields.category.status, "unlabeled");
  assert.deepEqual(plan.blocking_reasons, ["one_or_more_labeled_fields_missing_recommendation"]);
});

test("buildThresholdPlan blocks production use when the report is unlabeled", () => {
  const plan = buildThresholdPlan({
    labeled_posters: 0,
    field_metrics: {},
  }, { minLabeled: 120 });

  assert.equal(plan.production_ready, false);
  assert.deepEqual(plan.blocking_reasons, [
    "labeled_posters_below_120",
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
