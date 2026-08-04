import assert from "node:assert/strict";
import test from "node:test";

import {
  formatApplicationPeriod,
  formatPosterDate,
  getPosterApplicationState,
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

test("fixed deadlines expose D-day and closed states", () => {
  assert.deepEqual(
    getPosterApplicationState({
      applicationEndAt: "2026-08-06T14:59:59.000Z",
      now,
    }),
    { status: "closing_soon", label: "마감 임박", daysLeft: 2 },
  );
  assert.equal(
    getPosterApplicationState({
      applicationEndAt: "2026-08-02T14:59:59.000Z",
      now,
    }).status,
    "closed",
  );
});

test("start-only periods do not imply always open", () => {
  assert.equal(
    formatApplicationPeriod({ applicationStartAt: "2026-08-01T00:00:00.000Z" }),
    "2026.08.01부터 · 종료 일정 확인 필요",
  );
});
