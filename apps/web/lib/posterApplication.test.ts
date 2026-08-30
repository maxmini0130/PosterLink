import assert from "node:assert/strict";
import test from "node:test";

import {
  formatApplicationPeriod,
  formatPosterDate,
  getPosterApplicationState,
  isPosterAcceptingApplications,
  normalizePosterDeadlineType,
} from "./posterApplication";

const now = new Date("2026-08-04T03:00:00.000Z");

test("missing dates stay unconfirmed instead of becoming always open", () => {
  assert.deepEqual(getPosterApplicationState({ now }), {
    status: "needs_confirmation",
    label: "일정 확인 필요",
    daysLeft: null,
  });
  assert.equal(formatApplicationPeriod({}), "일정 확인 필요");
});

test("only an explicit ongoing deadline becomes always open", () => {
  assert.equal(normalizePosterDeadlineType("상시"), "ongoing");
  assert.deepEqual(
    getPosterApplicationState({ deadlineType: "ongoing", now }),
    {
      status: "ongoing",
      label: "상시 모집",
      daysLeft: null,
    },
  );
  assert.equal(formatApplicationPeriod({ deadlineType: "상시" }), "상시 모집");
});

test("explicit non-fixed deadline types do not inherit fixed D-day copy from an end date", () => {
  assert.deepEqual(
    getPosterApplicationState({
      applicationStartAt: "2026-08-01T00:00:00.000Z",
      applicationEndAt: "2026-12-31T14:59:59.000Z",
      deadlineType: "ongoing",
      now,
    }),
    { status: "ongoing", label: "상시 모집", daysLeft: null },
  );
  assert.equal(
    formatApplicationPeriod({
      applicationStartAt: "2026-08-01T00:00:00.000Z",
      applicationEndAt: "2026-12-31T14:59:59.000Z",
      deadlineType: "ongoing",
    }),
    "2026.08.01부터 상시 모집",
  );

  assert.deepEqual(
    getPosterApplicationState({
      applicationEndAt: "2026-08-10T14:59:59.000Z",
      deadlineType: "until_exhausted",
      now,
    }),
    { status: "until_exhausted", label: "소진 시 마감", daysLeft: null },
  );
  assert.equal(
    formatApplicationPeriod({
      applicationEndAt: "2026-08-10T14:59:59.000Z",
      deadlineType: "until_exhausted",
    }),
    "소진 시까지",
  );

  assert.deepEqual(
    getPosterApplicationState({
      applicationEndAt: "2026-08-10T14:59:59.000Z",
      deadlineType: "unknown",
      now,
    }),
    { status: "open", label: "일정 확인 필요", daysLeft: null },
  );
  assert.equal(
    formatApplicationPeriod({
      applicationStartAt: "2026-08-01T00:00:00.000Z",
      applicationEndAt: "2026-08-10T14:59:59.000Z",
      deadlineType: "unknown",
    }),
    "2026.08.01 ~ 2026.08.10 · 일정 확인 필요",
  );
});

test("deadline labels use the Asia/Seoul calendar day", () => {
  assert.deepEqual(
    getPosterApplicationState({
      applicationEndAt: "2026-08-04T15:30:00.000Z",
      now: new Date("2026-08-04T16:00:00.000Z"),
    }),
    { status: "due_today", label: "오늘 마감", daysLeft: 0 },
  );
  assert.equal(formatPosterDate("2026-08-04T15:30:00.000Z"), "2026.08.05");
});

test("fixed deadlines expose today, soon, open and closed states", () => {
  const cases = [
    {
      name: "today start",
      input: {
        applicationStartAt: "2026-08-03T15:00:00.000Z",
        applicationEndAt: "2026-08-10T14:59:59.000Z",
        now,
      },
      status: "open",
      accepting: true,
    },
    {
      name: "today end",
      input: {
        applicationEndAt: "2026-08-04T14:59:59.000Z",
        now,
      },
      status: "due_today",
      accepting: true,
    },
    {
      name: "one day left",
      input: {
        applicationEndAt: "2026-08-05T14:59:59.000Z",
        now,
      },
      status: "closing_soon",
      accepting: true,
    },
    {
      name: "three days left",
      input: {
        applicationEndAt: "2026-08-07T14:59:59.000Z",
        now,
      },
      status: "closing_soon",
      accepting: true,
    },
    {
      name: "already closed",
      input: {
        applicationEndAt: "2026-08-02T14:59:59.000Z",
        now,
      },
      status: "closed",
      accepting: false,
    },
    {
      name: "scheduled",
      input: {
        applicationStartAt: "2026-08-05T00:00:00.000Z",
        applicationEndAt: "2026-08-10T14:59:59.000Z",
        now,
      },
      status: "scheduled",
      accepting: false,
    },
    {
      name: "end only",
      input: {
        applicationEndAt: "2026-08-10T14:59:59.000Z",
        now,
      },
      status: "open",
      accepting: true,
    },
    {
      name: "utc date near seoul midnight",
      input: {
        applicationEndAt: "2026-08-04T15:30:00.000Z",
        now: new Date("2026-08-04T16:00:00.000Z"),
      },
      status: "due_today",
      accepting: true,
    },
  ] as const;

  for (const testCase of cases) {
    assert.equal(getPosterApplicationState(testCase.input).status, testCase.status, testCase.name);
    assert.equal(isPosterAcceptingApplications(testCase.input), testCase.accepting, testCase.name);
  }
});

test("start-only periods do not imply always open", () => {
  assert.equal(
    formatApplicationPeriod({ applicationStartAt: "2026-08-01T00:00:00.000Z" }),
    "2026.08.01부터 · 종료 일정 확인 필요",
  );
  assert.equal(
    getPosterApplicationState({ applicationStartAt: "2026-08-01T00:00:00.000Z", now }).status,
    "needs_confirmation",
  );
  assert.equal(
    isPosterAcceptingApplications({ applicationStartAt: "2026-08-01T00:00:00.000Z", now }),
    false,
  );
});

test("unknown, invalid, null and explicitly ongoing periods stay distinct", () => {
  const cases = [
    {
      name: "ongoing",
      input: { deadlineType: "ongoing", now },
      status: "ongoing",
      accepting: true,
    },
    {
      name: "until exhausted",
      input: { deadlineType: "until_exhausted", now },
      status: "until_exhausted",
      accepting: true,
    },
    {
      name: "no dates",
      input: { now },
      status: "needs_confirmation",
      accepting: false,
    },
    {
      name: "null values",
      input: { applicationStartAt: null, applicationEndAt: null, deadlineType: null, now },
      status: "needs_confirmation",
      accepting: false,
    },
    {
      name: "invalid start",
      input: { applicationStartAt: "not-a-date", applicationEndAt: "2026-08-10T14:59:59.000Z", now },
      status: "needs_confirmation",
      accepting: false,
    },
    {
      name: "invalid end",
      input: { applicationEndAt: "not-a-date", now },
      status: "needs_confirmation",
      accepting: false,
    },
  ] as const;

  for (const testCase of cases) {
    assert.equal(getPosterApplicationState(testCase.input).status, testCase.status, testCase.name);
    assert.equal(isPosterAcceptingApplications(testCase.input), testCase.accepting, testCase.name);
  }
});
