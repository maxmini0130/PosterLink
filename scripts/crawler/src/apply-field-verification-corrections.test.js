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

test("clear date quality mismatch remains actionable even with low overall confidence", () => {
  const correction = getCorrection(
    {
      application_end_at: "2026-08-17T15:00:00+00:00",
      created_at: "2026-08-26T00:00:00+00:00",
      source_org_name: "청년몽땅정보통",
      field_verification: {
        confidence: 0.45,
        correctedDeadline: "2026-08-28",
        deadlineMatches: false,
        dateIssues: [
          {
            code: "deadline-mismatch",
            evidence: "extracted 2026-08-18, notice 2026-08-28",
          },
        ],
        dateQuality: {
          decision: "review",
          normalizedDeadline: "2026-08-18",
          suggestedDeadline: "2026-08-28",
        },
      },
    },
    0.85,
  );

  assert.deepEqual(correction.updates, { application_end_at: "2026-08-28" });
  assert.equal(correction.changes.length, 1);
  assert.equal(correction.suppressed.length, 0);
});

test("low confidence date quality mismatch does not shorten an existing deadline", () => {
  const correction = getCorrection(
    {
      application_end_at: "2026-09-07T15:00:00+00:00",
      created_at: "2026-08-26T00:00:00+00:00",
      source_org_name: "청년몽땅정보통",
      field_verification: {
        confidence: 0.45,
        correctedDeadline: "2026-08-31",
        deadlineMatches: false,
        dateIssues: [
          {
            code: "deadline-mismatch",
            evidence: "extracted 2026-09-08, notice 2026-08-31",
          },
        ],
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

// 2026-11-19: a model guess older than a person's source review, or one that
// reads the event day as the deadline, must not count as a correction.
const songpaLike = (overrides = {}) => ({
  application_end_at: "2026-11-20T14:59:59+00:00",
  event_start_at: "2026-11-24T10:00:00+00:00",
  event_end_at: "2026-11-25T12:00:00+00:00",
  created_at: "2026-11-18T09:08:00+00:00",
  source_org_name: "청년몽땅정보통",
  ...overrides,
  field_verification: {
    checkedAt: "2026-11-18T09:08:10.308Z",
    confidence: 0.45,
    correctedDeadline: "2026-11-24",
    deadlineMatches: false,
    dateIssues: [{ code: "deadline-mismatch" }],
    dateQuality: {
      decision: "review",
      normalizedDeadline: "2026-11-24",
      suggestedDeadline: "2026-11-25",
    },
    ...(overrides.field_verification ?? {}),
  },
});

test("person source review after the AI check suppresses the old deadline guess", () => {
  const correction = getCorrection(
    songpaLike({
      event_start_at: null,
      event_end_at: null,
      field_verification: {
        sourceReview20261118b: {
          reviewer: "Claude source review",
          reviewedAt: "2026-11-18T13:15:37.433Z",
        },
      },
    }),
    0.85,
  );
  assert.deepEqual(correction.changes, []);
  assert.deepEqual(correction.updates, {});
  assert.equal(
    correction.suppressed[0].reason,
    "person_reviewed_after_ai_check",
  );
});

test("a person review made before the AI check does not suppress it", () => {
  const correction = getCorrection(
    songpaLike({
      event_start_at: null,
      event_end_at: null,
      field_verification: {
        sourceReview20261112: {
          reviewer: "Claude source review",
          reviewedAt: "2026-11-12T03:00:00Z",
        },
      },
    }),
    0.85,
  );
  assert.deepEqual(correction.updates, { application_end_at: "2026-11-24" });
});

test("a model reviewer does not count as a person review", () => {
  const correction = getCorrection(
    songpaLike({
      event_start_at: null,
      event_end_at: null,
      field_verification: {
        sourceReview20261118b: {
          reviewer: "ai-queue",
          reviewedAt: "2026-11-18T13:15:37.433Z",
        },
      },
    }),
    0.85,
  );
  assert.deepEqual(correction.updates, { application_end_at: "2026-11-24" });
});

test("event day proposed as the deadline is suppressed", () => {
  const correction = getCorrection(songpaLike(), 0.85);
  assert.deepEqual(correction.changes, []);
  assert.equal(
    correction.suppressed[0].reason,
    "corrected_deadline_is_event_date",
  );
});

test("a later date outside the event days stays actionable", () => {
  const correction = getCorrection(
    songpaLike({
      field_verification: {
        correctedDeadline: "2026-11-22",
        dateQuality: { decision: "review" },
      },
    }),
    0.85,
  );
  assert.deepEqual(correction.updates, { application_end_at: "2026-11-22" });
});
