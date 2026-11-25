import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveReviewStatus,
  kstDate,
  reviewedDateUpdate,
  reviewedDeadlineType,
  storedDates,
  timestampForReviewedDate,
} from "./review-queue-dates.js";

test("a stored KST midnight reads as the KST date, not the UTC date", () => {
  assert.equal(kstDate("2026-11-22T15:00:00+00:00"), "2026-11-23");
  assert.equal(kstDate("2026-12-18T14:59:59+00:00"), "2026-12-18");
  assert.equal(kstDate("2026-11-25"), "2026-11-25");
  assert.equal(kstDate(null), null);
  assert.deepEqual(storedDates({ application_start_at: "2026-11-22T15:00:00+00:00" }), {
    application_start_at: "2026-11-23",
    application_end_at: null,
    event_start_at: null,
    event_end_at: null,
  });
});

test("an unchanged date keeps the stored time (18:00 deadline stays 18:00)", () => {
  const stored = "2026-11-25T09:00:00+00:00";
  assert.equal(timestampForReviewedDate(stored, "2026-11-25", "application_end_at"), stored);
  assert.equal(
    timestampForReviewedDate(stored, "2026-11-26", "application_end_at"),
    "2026-11-26T23:59:59+09:00",
  );
  assert.equal(
    timestampForReviewedDate(null, "2026-11-23", "application_start_at"),
    "2026-11-23T00:00:00+09:00",
  );
  assert.equal(timestampForReviewedDate(stored, null, "application_end_at"), null);
});

test("a passed deadline closes the poster even when the model says published", () => {
  const today = "2026-11-25";
  assert.equal(deriveReviewStatus({ status: "published", application_end_at: "2026-11-18" }, today), "closed");
  assert.equal(deriveReviewStatus({ status: "published", application_end_at: "2026-11-25" }, today), "published");
  assert.equal(deriveReviewStatus({ status: "published", event_end_at: "2026-11-20" }, today), "closed");
  assert.equal(deriveReviewStatus({ status: "closed", application_end_at: "2026-12-01" }, today), "closed");
  assert.equal(deriveReviewStatus({ status: "keep_review" }, today), "published");
});

test("per_session and scheduled survive when the reviewed dates are unchanged", () => {
  assert.equal(reviewedDeadlineType("per_session", "fixed", true), "per_session");
  assert.equal(reviewedDeadlineType("scheduled", "unknown", true), "scheduled");
  assert.equal(reviewedDeadlineType("per_session", "fixed", false), "fixed");
  assert.equal(reviewedDeadlineType("fixed", "until_exhausted", true), "until_exhausted");
  assert.equal(reviewedDeadlineType("fixed", "bogus", true), "unknown");
});

test("the update keeps verification for an unchanged deadline and clears it for a changed one", () => {
  const row = {
    application_start_at: "2026-11-22T15:00:00+00:00",
    application_end_at: "2026-11-25T09:00:00+00:00",
    event_start_at: null,
    event_end_at: null,
  };
  const same = reviewedDateUpdate(row, {
    application_start_at: "2026-11-23",
    application_end_at: "2026-11-25",
    event_start_at: null,
    event_end_at: null,
    deadline_type: "fixed",
  });
  assert.equal(same.application_start_at, row.application_start_at);
  assert.equal(same.application_end_at, row.application_end_at);
  assert.equal("deadline_status" in same, false);

  const moved = reviewedDateUpdate(row, {
    application_start_at: "2026-11-23",
    application_end_at: "2026-12-18",
    event_start_at: null,
    event_end_at: null,
    deadline_type: "fixed",
  });
  assert.equal(moved.application_end_at, "2026-12-18T23:59:59+09:00");
  assert.equal(moved.deadline_status, "unverified");
  assert.equal(moved.deadline_source, null);
  assert.equal(moved.deadline_time_verified, false);
});
