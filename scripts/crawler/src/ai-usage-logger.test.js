import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImageClassificationUsageRow,
  logAiUsage,
} from "./ai-usage-logger.js";

test("buildImageClassificationUsageRow creates VLM usage rows", () => {
  const row = buildImageClassificationUsageRow({
    posterId: "poster-1",
    model: "gpt-5-mini",
    metadata: { batch: 1 },
  });

  assert.equal(row.job_name, "image-classification-backfill");
  assert.equal(row.stage_label, "vlm");
  assert.equal(row.operation, "is_real_poster");
  assert.equal(row.poster_id, "poster-1");
  assert.equal(row.field_key, "is_real_poster");
  assert.equal(row.image_count, 1);
  assert.equal(row.estimated_unit_cost, 25);
});

test("logAiUsage skips when disabled", async () => {
  const previous = process.env.POSTER_AI_USAGE_LOG;
  process.env.POSTER_AI_USAGE_LOG = "0";
  try {
    const result = await logAiUsage({ from: () => { throw new Error("should not insert"); } }, {});
    assert.equal(result.status, "skipped");
  } finally {
    if (previous === undefined) delete process.env.POSTER_AI_USAGE_LOG;
    else process.env.POSTER_AI_USAGE_LOG = previous;
  }
});

test("logAiUsage inserts rows when enabled", async () => {
  const inserted = [];
  const supabase = {
    from(table) {
      assert.equal(table, "ai_usage_log");
      return {
        async insert(row) {
          inserted.push(row);
          return { error: null };
        },
      };
    },
  };

  const result = await logAiUsage(supabase, { job_name: "test" });
  assert.equal(result.status, "logged");
  assert.deepEqual(inserted, [{ job_name: "test" }]);
});
