import assert from "node:assert/strict";
import test from "node:test";

import {
  attachAiUsageMetadata,
  buildImageClassificationUsageRow,
  buildTextModelUsageRow,
  buildTextVerificationUsageRow,
  extractAiUsageMetadata,
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

test("buildTextVerificationUsageRow creates high-text usage rows", () => {
  const row = buildTextVerificationUsageRow({
    posterId: "poster-1",
    model: "gpt-5",
    inputTokens: 1200,
    outputTokens: 300,
    metadata: { decision: "checked" },
  });

  assert.equal(row.job_name, "field-verification-backfill");
  assert.equal(row.stage_label, "high_text");
  assert.equal(row.operation, "field_verification");
  assert.equal(row.poster_id, "poster-1");
  assert.equal(row.estimated_unit_cost, 20);
});

test("buildTextModelUsageRow supports crawler text operations", () => {
  const row = buildTextModelUsageRow({
    posterId: "poster-1",
    model: "gpt-5-mini",
    operation: "notice_facts_extraction",
    stageLabel: "cheap_text",
    inputTokens: 300,
    outputTokens: 80,
    metadata: { sourceKey: "source-1" },
  });

  assert.equal(row.job_name, "crawler-upload");
  assert.equal(row.stage_label, "cheap_text");
  assert.equal(row.operation, "notice_facts_extraction");
  assert.equal(row.estimated_unit_cost, 1);
  assert.deepEqual(row.metadata, { sourceKey: "source-1" });
});

test("AI usage metadata stays non-enumerable", () => {
  const result = attachAiUsageMetadata({ ok: true }, { operation: "test" });

  assert.deepEqual(Object.keys(result), ["ok"]);
  assert.equal(JSON.stringify(result), "{\"ok\":true}");
  assert.deepEqual(extractAiUsageMetadata(result), { operation: "test" });
});

test("AI usage metadata stays off serialized embedding arrays", () => {
  const embedding = attachAiUsageMetadata([0.1, 0.2], { operation: "poster_embedding" });

  assert.deepEqual(Object.keys(embedding), ["0", "1"]);
  assert.equal(JSON.stringify(embedding), "[0.1,0.2]");
  assert.deepEqual(extractAiUsageMetadata(embedding), { operation: "poster_embedding" });
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
