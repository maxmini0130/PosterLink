import assert from "node:assert/strict";
import test from "node:test";

import { shouldBackfillStructuredField } from "./structured-backfill-policy.js";

const base = {
  reviewIssues: false,
  confidence: 0.9,
  minConfidence: 0.8,
  includeUserFacingText: false,
};

test("organization backfill requires high confidence without review issues", () => {
  assert.equal(
    shouldBackfillStructuredField({ ...base, field: "organizer_name" }),
    true,
  );
  assert.equal(
    shouldBackfillStructuredField({
      ...base,
      field: "organizer_name",
      confidence: 0.79,
    }),
    false,
  );
  assert.equal(
    shouldBackfillStructuredField({
      ...base,
      field: "organizer_name",
      reviewIssues: true,
    }),
    false,
  );
});

test("user-facing facts stay excluded by default even at high confidence", () => {
  assert.equal(
    shouldBackfillStructuredField({
      ...base,
      field: "eligibility_summary",
    }),
    false,
  );
});

test("user-facing facts require explicit opt-in and verified text", () => {
  assert.equal(
    shouldBackfillStructuredField({
      ...base,
      field: "application_method",
      includeUserFacingText: true,
    }),
    true,
  );
  assert.equal(
    shouldBackfillStructuredField({
      ...base,
      field: "application_method",
      includeUserFacingText: true,
      reviewIssues: true,
    }),
    false,
  );
});

test("deterministic fields are not blocked by the text policy", () => {
  for (const field of [
    "deadline_type",
    "verification_status",
    "data_confidence",
  ]) {
    assert.equal(
      shouldBackfillStructuredField({
        ...base,
        field,
        confidence: null,
        reviewIssues: true,
      }),
      true,
    );
  }
});
