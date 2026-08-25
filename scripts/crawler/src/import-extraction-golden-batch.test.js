import assert from "node:assert/strict";
import test from "node:test";

import { buildGoldenImportPlan } from "./import-extraction-golden-batch.js";

test("imports only reviewed batch items with top-level truth", () => {
  const plan = buildGoldenImportPlan(
    {
      source_seed: "data/eval/seed.json",
      items: [
        {
          poster_id: "poster-1",
          labeled_by: "",
          context: {
            title: "Reviewed poster",
            source_key: "https://example.com/notice/1",
          },
          review_fields: {
            deadline_date: {
              truth: "__FILL_AFTER_SOURCE_REVIEW_OR_OMIT__",
            },
          },
          truth: {
            deadline_date: "2026-09-04",
            official_url: "https://example.com/notice/1",
          },
        },
        {
          poster_id: "poster-2",
          truth: {},
        },
      ],
    },
    {
      defaultLabeledBy: "max",
      defaultLabeledAt: "2026-08-25",
      sourceBatch: "data/eval/review-batches/batch-01.json",
    },
  );

  assert.equal(plan.ok, true);
  assert.equal(plan.total_items, 2);
  assert.equal(plan.importable_items, 1);
  assert.equal(plan.skipped_items, 1);
  assert.deepEqual(plan.skipped, [{ poster_id: "poster-2", reason: "empty_truth" }]);
  assert.deepEqual(plan.goldenItems, [
    {
      poster_id: "poster-1",
      labeled_by: "max",
      labeled_at: "2026-08-25",
      truth: {
        deadline_date: "2026-09-04",
        official_url: "https://example.com/notice/1",
      },
      notes: undefined,
      source_review_batch: "data/eval/review-batches/batch-01.json",
      context_title: "Reviewed poster",
      context_source_url: "https://example.com/notice/1",
    },
  ]);
});

test("require-complete reports empty truth rows as errors", () => {
  const plan = buildGoldenImportPlan(
    {
      items: [
        {
          poster_id: "poster-1",
          truth: {},
        },
      ],
    },
    {
      requireComplete: true,
    },
  );

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.errors, ["items[0]: truth is empty"]);
});

test("placeholder truth values are removed before import", () => {
  const plan = buildGoldenImportPlan({
    items: [
      {
        poster_id: "poster-1",
        truth: {
          deadline_date: "__FILL_AFTER_SOURCE_REVIEW_OR_OMIT__",
          is_real_poster: true,
        },
      },
    ],
  });

  assert.equal(plan.importable_items, 1);
  assert.deepEqual(plan.goldenItems[0].truth, { is_real_poster: true });
});
