import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAiUsage } from "./measure-ai-usage.js";

test("summarizeAiUsage groups usage rows by stage, operation, model, and status", () => {
  const report = summarizeAiUsage({
    days: 7,
    dailyRows: [
      {
        stage_label: "cheap_text",
        operation: "poster_relevance_route",
        model: "gpt-5-mini",
        status: "success",
        call_count: 2,
        input_tokens: 100,
        output_tokens: 20,
        image_count: 0,
        estimated_unit_cost: 2,
      },
      {
        stage_label: "vlm",
        operation: "poster_ocr",
        model: "gpt-5-mini",
        status: "success",
        call_count: 1,
        input_tokens: 200,
        output_tokens: 80,
        image_count: 1,
        estimated_unit_cost: 25,
      },
    ],
    recentRows: [
      { poster_id: "poster-1", metadata: {} },
      { poster_id: null, metadata: { candidateId: "candidate-1" } },
      { poster_id: null, metadata: {} },
    ],
  });

  assert.equal(report.totals.days, 7);
  assert.equal(report.totals.call_count, 3);
  assert.equal(report.totals.input_tokens, 300);
  assert.equal(report.totals.output_tokens, 100);
  assert.equal(report.totals.image_count, 1);
  assert.equal(report.totals.estimated_unit_cost, 27);
  assert.equal(report.by_stage[0].stage_label, "vlm");
  assert.equal(report.by_operation[0].operation, "poster_ocr");
  assert.deepEqual(report.linkage_sample, {
    total_rows_sampled: 3,
    poster_linked_rows: 1,
    candidate_metadata_rows: 1,
    unlinked_rows: 1,
  });
});
