import assert from "node:assert/strict";
import test from "node:test";

import {
  getPosterStructuredReadiness,
  getVerifiedPosterCalendarSource,
  hasVerifiedPosterStructuredData,
  isVerifiedPosterDeadlineNotificationReady,
} from "./posterStructuredTrust";

const verifiedBase = {
  verification_status: "verified",
  verified_at: "2026-08-04T03:00:00.000Z",
};

test("verified status requires an auditable verification timestamp", () => {
  assert.equal(hasVerifiedPosterStructuredData({ verification_status: "verified" }), false);
  assert.equal(
    hasVerifiedPosterStructuredData({ verification_status: "verified", verified_at: "invalid" }),
    false,
  );
  assert.equal(hasVerifiedPosterStructuredData(verifiedBase), true);
});

test("calendar uses a verified event before a verified fixed deadline", () => {
  assert.deepEqual(
    getVerifiedPosterCalendarSource({
      ...verifiedBase,
      deadline_type: "fixed",
      application_end_at: "2026-08-10T14:59:59.000Z",
      event_start_at: "2026-08-20T01:00:00.000Z",
      event_end_at: "2026-08-20T03:00:00.000Z",
    }),
    {
      kind: "event",
      startAt: "2026-08-20T01:00:00.000Z",
      endAt: "2026-08-20T03:00:00.000Z",
    },
  );
});

test("unverified or non-fixed deadlines cannot drive calendar and deadline alerts", () => {
  const unverified = {
    verification_status: "needs_review",
    verified_at: "2026-08-04T03:00:00.000Z",
    deadline_type: "fixed",
    application_end_at: "2026-08-10T14:59:59.000Z",
  };
  assert.equal(getVerifiedPosterCalendarSource(unverified), null);
  assert.equal(isVerifiedPosterDeadlineNotificationReady(unverified), false);
  assert.equal(
    isVerifiedPosterDeadlineNotificationReady({
      ...verifiedBase,
      deadline_type: "ongoing",
      application_end_at: "2026-08-10T14:59:59.000Z",
    }),
    false,
  );
});

test("readiness reports only verified and usable structured facts", () => {
  assert.deepEqual(
    getPosterStructuredReadiness({
      ...verifiedBase,
      organizer_name: "포스터링크 재단",
      deadline_type: "fixed",
      application_end_at: "2026-08-10T14:59:59.000Z",
    }),
    {
      verified: true,
      seoReady: true,
      calendarReady: true,
      deadlineNotificationReady: true,
    },
  );
});
