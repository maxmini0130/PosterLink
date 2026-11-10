import assert from "node:assert/strict";
import test from "node:test";

import {
  decideDeadlineVerification,
  deadlineTrail,
  isMissingDeadlineVerificationColumnError,
  portalDeadlineIso,
  readPortalDeadline,
  seoulDeadlineParts,
  withoutDeadlineVerificationFields,
} from "./deadline-provenance.js";

const NOW = new Date("2026-11-10T05:00:00Z");

test("portal fields: a stated time counts, 00:00 and 23:59:59 do not", () => {
  // 청년몽땅 header for a date-only notice (2e812cc9, cde477b0).
  assert.deepEqual(
    readPortalDeadline("신청기간 2026-10-27 ~ 2026-11-10 00 : 00", {
      site: "youth-seoul",
      field: "신청기간",
    }),
    {
      source: "portal",
      site: "youth-seoul",
      field: "신청기간",
      raw: "신청기간 2026-10-27 ~ 2026-11-10 00 : 00",
      date: "2026-11-10",
      time: null,
    },
  );
  // 청년몽땅 with a real time (24312656), as the header prints it.
  assert.equal(
    readPortalDeadline(
      "신청기간 2026-05-08 ~ 2026-12-31 19 : 00 [ 선착순 마감 ]",
    ).time,
    "19:00",
  );
  assert.equal(readPortalDeadline("신청기간 상시"), null);
  // K-Startup 접수기간 (37272d2d).
  const kStartup = readPortalDeadline("2026-10-27 ~ 2026-11-10 14:00");
  assert.equal(kStartup.date, "2026-11-10");
  assert.equal(kStartup.time, "14:00");
  assert.equal(
    readPortalDeadline("2026-10-08 ~ 2026-11-10 23:59").time,
    "23:59",
  );
  assert.equal(readPortalDeadline("~ 2026-11-10 23:59:59").time, null);
  assert.equal(
    readPortalDeadline("2026.10.01 ~ 2026.11.10(화) 17:00").time,
    "17:00",
  );
  // 온통청년 API 신청 종료일 and K-Startup list 마감일자.
  assert.equal(readPortalDeadline("20261130").date, "2026-11-30");
  assert.equal(readPortalDeadline("마감일자 2026-11-10").date, "2026-11-10");
});

test("portal fields without a usable end date give nothing", () => {
  assert.equal(readPortalDeadline(""), null);
  assert.equal(readPortalDeadline("예산 소진 시까지"), null);
  assert.equal(readPortalDeadline("2026-11-04 ~"), null);
  assert.equal(readPortalDeadline("2026-02-30"), null);
  // Only the end of a range counts, not its start.
  assert.equal(readPortalDeadline("2026-10-27 10:00 ~ 2026-11-10").time, null);
});

test("stored values compare in Asia/Seoul", () => {
  assert.deepEqual(seoulDeadlineParts("2026-11-10"), {
    date: "2026-11-10",
    time: null,
  });
  assert.deepEqual(seoulDeadlineParts("2026-11-10T14:59:59Z"), {
    date: "2026-11-10",
    time: null,
  });
  assert.deepEqual(seoulDeadlineParts("2026-11-10T05:00:00Z"), {
    date: "2026-11-10",
    time: "14:00",
  });
  assert.equal(
    portalDeadlineIso({ date: "2026-11-10", time: null }),
    "2026-11-10T23:59:59+09:00",
  );
  assert.equal(
    portalDeadlineIso({ date: "2026-11-10", time: "14:00" }),
    "2026-11-10T14:00:00+09:00",
  );
});

test("the trail keeps each step that changed the value", () => {
  assert.deepEqual(
    deadlineTrail([
      { path: "portal_field", value: "2026-11-10" },
      { path: "field_verification", value: "2026-11-10T23:59:59+09:00" },
      { path: "date_quality", value: "2026-11-12" },
      { path: "structured_fields", value: null },
    ]),
    [
      { path: "portal_field", value: "2026-11-10" },
      { path: "date_quality", value: "2026-11-12" },
    ],
  );
});

test("a deadline that still matches the portal field is a confirmed date", () => {
  const portal = readPortalDeadline("신청기간 2026-10-27 ~ 2026-11-10 00 : 00");
  const result = decideDeadlineVerification({
    portal,
    steps: [{ path: "portal_field", value: "2026-11-10" }],
    finalValue: "2026-11-10T23:59:59+09:00",
    now: NOW,
  });
  assert.deepEqual(result.columns, {
    deadline_status: "verified",
    deadline_source: "portal",
    deadline_time_verified: false,
    deadline_checked_at: NOW.toISOString(),
  });
  assert.equal(result.applicationEndAt, "2026-11-10T23:59:59+09:00");
  assert.equal(result.record.reason, "matches-portal-date");
});

test("a portal time confirms the time, and is restored when a step dropped it", () => {
  const portal = readPortalDeadline("2026-10-27 ~ 2026-11-10 14:00");
  const same = decideDeadlineVerification({
    portal,
    finalValue: "2026-11-10T14:00:00+09:00",
    now: NOW,
  });
  assert.equal(same.columns.deadline_time_verified, true);
  assert.equal(same.record.reason, "matches-portal-time");

  const dropped = decideDeadlineVerification({
    portal,
    finalValue: "2026-11-10T23:59:59+09:00",
    now: NOW,
  });
  assert.equal(dropped.applicationEndAt, "2026-11-10T14:00:00+09:00");
  assert.equal(dropped.columns.deadline_time_verified, true);
  assert.equal(dropped.record.reason, "portal-time-restored");
});

test("a value changed after the portal field goes back to unverified", () => {
  const portal = readPortalDeadline("신청기간 2026-10-29 ~ 2026-11-11");
  const changed = decideDeadlineVerification({
    portal,
    steps: [
      { path: "portal_field", value: "2026-11-11" },
      { path: "date_quality", value: "2026-11-10" },
    ],
    finalValue: "2026-11-10T23:59:59+09:00",
    now: NOW,
  });
  assert.deepEqual(changed.columns, {
    deadline_status: "unverified",
    deadline_source: null,
    deadline_time_verified: false,
    deadline_checked_at: NOW.toISOString(),
  });
  assert.equal(changed.record.reason, "changed-after-portal");
  assert.deepEqual(
    changed.record.trail.map((step) => step.path),
    ["portal_field", "date_quality"],
  );
  // The stored value is left as the pipeline chose; only the status says it is unconfirmed.
  assert.equal(changed.applicationEndAt, "2026-11-10T23:59:59+09:00");

  const timeDiffers = decideDeadlineVerification({
    portal: readPortalDeadline("2026-10-27 ~ 2026-11-10 14:00"),
    finalValue: "2026-11-10T18:00:00+09:00",
    now: NOW,
  });
  assert.equal(timeDiffers.columns.deadline_status, "unverified");
  assert.equal(timeDiffers.record.reason, "time-differs-from-portal");
});

test("a portal date with a time read from the text confirms the date only", () => {
  const result = decideDeadlineVerification({
    portal: readPortalDeadline("신청기간 2026-10-28 ~ 2026-11-10"),
    finalValue: "2026-11-10T23:00:00+09:00",
    now: NOW,
  });
  assert.equal(result.columns.deadline_status, "verified");
  assert.equal(result.columns.deadline_time_verified, false);
  assert.equal(result.applicationEndAt, "2026-11-10T23:00:00+09:00");
});

test("no portal field means unverified", () => {
  assert.equal(
    decideDeadlineVerification({
      portal: null,
      finalValue: "2026-11-10",
      now: NOW,
    }).record.reason,
    "no-portal-field",
  );
  assert.equal(
    decideDeadlineVerification({ portal: null, finalValue: null, now: NOW })
      .record.reason,
    "no-deadline",
  );
  assert.equal(
    decideDeadlineVerification({
      portal: readPortalDeadline("2026-11-10"),
      finalValue: null,
      now: NOW,
    }).columns.deadline_status,
    "unverified",
  );
});

test("missing-column errors are recognised so inserts can retry without the columns", () => {
  assert.equal(
    isMissingDeadlineVerificationColumnError({
      code: "PGRST204",
      message:
        "Could not find the 'deadline_status' column of 'posters' in the schema cache",
    }),
    true,
  );
  assert.equal(
    isMissingDeadlineVerificationColumnError({
      code: "23505",
      message: "duplicate key",
    }),
    false,
  );
  assert.deepEqual(
    withoutDeadlineVerificationFields({
      title: "t",
      deadline_status: "verified",
      deadline_source: "portal",
      deadline_time_verified: false,
      deadline_checked_at: "x",
    }),
    { title: "t" },
  );
});
