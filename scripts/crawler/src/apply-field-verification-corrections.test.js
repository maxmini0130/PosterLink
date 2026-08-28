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

test("deadline comparison uses the Seoul calendar day", () => {
  const correction = getCorrection(
    {
      application_end_at: "2026-09-01T15:00:00+00:00",
      source_org_name: "강서구",
      field_verification: {
        confidence: 0.95,
        correctedDeadline: "2026-09-02",
        deadlineMatches: false,
      },
    },
    0.85,
  );

  assert.equal(correction, null);
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

test("stale correctedDeadline does not override current date quality", () => {
  const correction = getCorrection(
    {
      application_end_at: "2026-09-03T15:00:00+00:00",
      created_at: "2026-08-27T00:00:00+00:00",
      source_org_name: "Pocket Company",
      field_verification: {
        confidence: 0.95,
        correctedDeadline: "2026-09-13",
        deadlineMatches: false,
        dateQuality: {
          normalizedDeadline: "2026-09-04",
        },
      },
    },
    0.85,
  );

  assert.deepEqual(correction.updates, {});
  assert.equal(correction.changes.length, 0);
  assert.deepEqual(correction.suppressed, [
    {
      field: "application_end_at",
      old: "2026-09-04",
      next: "2026-09-13",
      reason: "current_deadline_matches_date_quality",
    },
  ]);
});

test("stale past-year correctedDeadline is suppressed", () => {
  const correction = getCorrection(
    {
      application_end_at: "2026-09-09T15:00:00+00:00",
      created_at: "2026-08-27T00:00:00+00:00",
      source_org_name: "Youth Center",
      field_verification: {
        confidence: 0.95,
        correctedDeadline: "2023-09-10",
        deadlineMatches: false,
      },
    },
    0.85,
  );

  assert.deepEqual(correction.updates, {});
  assert.equal(correction.changes.length, 0);
  assert.deepEqual(correction.suppressed, [
    {
      field: "application_end_at",
      old: "2026-09-10",
      next: "2023-09-10",
      reason: "corrected_deadline_is_older_than_current_context",
    },
  ]);
});
