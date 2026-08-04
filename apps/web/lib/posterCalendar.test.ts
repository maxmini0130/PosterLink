import assert from "node:assert/strict";
import test from "node:test";

import { buildVerifiedPosterCalendar } from "./posterCalendar";

test("calendar export rejects unverified structured dates", () => {
  assert.equal(
    buildVerifiedPosterCalendar({
      id: "poster-1",
      title: "청년 지원사업",
      verification_status: "needs_review",
      verified_at: null,
      deadline_type: "fixed",
      application_end_at: "2026-08-10T14:59:59.000Z",
    }),
    null,
  );
});

test("calendar export creates a fixed deadline event from verified data", () => {
  const file = buildVerifiedPosterCalendar(
    {
      id: "poster-2",
      title: "청년, 지원;사업",
      verification_status: "verified",
      verified_at: "2026-08-04T03:00:00.000Z",
      deadline_type: "fixed",
      application_end_at: "2026-08-10T14:59:59.000Z",
    },
    "https://example.com/notice",
    new Date("2026-08-04T00:00:00.000Z"),
  );

  assert.ok(file);
  assert.equal(file.filename, "posterlink-poster-2.ics");
  assert.match(file.content, /DTSTART:20260810T145959Z/);
  assert.match(file.content, /SUMMARY:청년\\, 지원\\;사업 신청 마감/);
  assert.match(file.content, /DESCRIPTION:공식 공고: https:\/\/example.com\/notice/);
});
