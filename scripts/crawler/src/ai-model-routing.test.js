import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_MODEL_STAGES,
  buildAiUsageLogRow,
  chooseAiStage,
  estimateAiUnitCost,
  fieldDefaultStage,
} from "./ai-model-routing.js";

test("fieldDefaultStage keeps deterministic fields on rule stage", () => {
  assert.equal(fieldDefaultStage("deadline_date").label, "rule");
  assert.equal(fieldDefaultStage("official_url").stage, 0);
  assert.equal(fieldDefaultStage("content_type").label, "cheap_text");
});

test("chooseAiStage sends ambiguous poster detection to VLM only", () => {
  assert.equal(chooseAiStage({ fieldKey: "is_real_poster", needsVlm: true }).label, "vlm");
  assert.equal(chooseAiStage({ fieldKey: "is_real_poster", needsVlm: false }).label, "rule");
});

test("chooseAiStage escalates low-confidence critical cheap fields", () => {
  const result = chooseAiStage({
    fieldKey: "content_type",
    confidence: 0.4,
    threshold: 0.9,
    critical: true,
  });

  assert.equal(result.label, "high_text");
  assert.equal(result.reason, "critical_field_escalation");
});

test("chooseAiStage skips model calls when evidence already passes threshold", () => {
  const result = chooseAiStage({
    fieldKey: "category",
    confidence: 0.95,
    threshold: 0.8,
  });

  assert.equal(result.label, "rule");
  assert.equal(result.reason, "existing_evidence_above_threshold");
});

test("estimateAiUnitCost uses stage unit costs and token/image units", () => {
  assert.equal(estimateAiUnitCost({ stageLabel: "rule", calls: 10, inputTokens: 10000 }), 0);
  assert.equal(estimateAiUnitCost({ stageLabel: "cheap_text", calls: 2, inputTokens: 1200 }), 4);
  assert.equal(estimateAiUnitCost({ stageLabel: "vlm", calls: 1, inputTokens: 100, imageCount: 2 }), 50);
});

test("buildAiUsageLogRow emits DB-compatible usage rows", () => {
  const row = buildAiUsageLogRow({
    jobName: "phase6-test",
    stageLabel: "cheap_text",
    operation: "category",
    posterId: "poster-1",
    fieldKey: "category",
    inputTokens: 800,
    outputTokens: 50,
  });

  assert.equal(row.job_name, "phase6-test");
  assert.equal(row.stage, AI_MODEL_STAGES.cheap_text.stage);
  assert.equal(row.stage_label, "cheap_text");
  assert.equal(row.poster_id, "poster-1");
  assert.equal(row.field_key, "category");
  assert.equal(row.estimated_unit_cost, 1);
});
