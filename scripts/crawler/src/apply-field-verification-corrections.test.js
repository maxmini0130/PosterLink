import assert from "node:assert/strict";
import test from "node:test";

import { getCorrection } from "./apply-field-verification-corrections.js";

test("deadline corrections remain actionable", () => {
  const correction = getCorrection(
    {
      application_end_at: "2026-08-09T14:59:59+00:00",
      source_org_name: "청년몽땅정보통",
      field_verification: {
        confidence: 0.95,
        correctedDeadline: "2026-08-10",
        deadlineMatches: false,
      },
    },
    0.85,
  );

  assert.deepEqual(correction.updates, { application_end_at: "2026-08-10" });
  assert.equal(correction.changes.length, 1);
  assert.equal(correction.suppressed.length, 0);
});

test("organizer suggestions are not applied to source_org_name", () => {
  const correction = getCorrection(
    {
      application_end_at: null,
      source_org_name: "청년몽땅정보통",
      field_verification: {
        confidence: 0.95,
        organizationConfidence: 0.95,
        orgNameMatches: false,
        correctedOrgName: "서울청년센터 강북",
      },
    },
    0.85,
  );

  assert.deepEqual(correction.updates, {});
  assert.equal(correction.changes.length, 0);
  assert.deepEqual(correction.suppressed, [
    {
      field: "source_org_name",
      old: "청년몽땅정보통",
      next: "서울청년센터 강북",
      reason: "source_org_name_is_collection_source",
    },
  ]);
});
