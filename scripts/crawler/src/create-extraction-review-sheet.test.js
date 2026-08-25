import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewSheet } from "./create-extraction-review-sheet.js";

test("buildReviewSheet renders index, critical fields, and JSON edit block", () => {
  const sheet = buildReviewSheet(
    {
      items: [
        {
          poster_id: "poster-1",
          labeled_by: "max",
          labeled_at: "2026-08-25",
          context: {
            title: "Sample recruitment",
            poster_status: "published",
            exposure_tier: "A",
            sample_bucket: "normal_recruit",
            source_key: "https://example.com/notice/1",
            source_excerpt: "신청기간 2026-08-01 ~ 2026-08-31",
          },
          review_fields: {
            is_real_poster: {
              current_prediction: true,
              confidence: 0.95,
              extractor: "poster-detection-signals-v1",
              evidence_text: "classifier_accept",
            },
            deadline_date: {
              current_prediction: "2026-08-31",
              confidence: 0.9,
              extractor: "deadline-date-grounded-v1",
              evidence_text: "신청기간 2026-08-01 ~ 2026-08-31",
            },
            apply_method: {
              current_prediction: "온라인 접수",
              confidence: 0.8,
              extractor: "readable-notice-v1",
              evidence_text: "신청방법 온라인 접수",
            },
          },
          truth: {
            deadline_date: "2026-08-31",
          },
        },
      ],
    },
    { sourcePath: "data/eval/review-batches/batch-01.json" },
  );

  assert.match(sheet, /# data\/eval\/review-batches\/batch-01\.json/);
  assert.match(sheet, /\| 1 \| normal_recruit \| Sample recruitment/);
  assert.match(sheet, /is_real_poster=true/);
  assert.match(sheet, /`deadline_date`: 2026-08-31/);
  assert.match(sheet, /Optional fields with predictions:/);
  assert.match(sheet, /`apply_method`: 온라인 접수/);
  assert.match(sheet, /"truth": \{\n    "deadline_date": "2026-08-31"\n  \}/);
});
