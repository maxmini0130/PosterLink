import assert from "node:assert/strict";
import test from "node:test";

import { getDeadlineDisplay, isClosingWithinDays } from "./deadlineDisplay";
import { getPosterApplicationState } from "./posterApplication";

// 2026-11-03 12:00 KST
const now = new Date("2026-11-03T03:00:00.000Z");
const fixed = (applicationEndAt: string, extra = {}) =>
  getDeadlineDisplay({
    applicationEndAt,
    deadlineType: "fixed",
    now,
    ...extra,
  });

test("trusted fixed deadlines show D-n, today and the KST end date", () => {
  assert.deepEqual(fixed("2026-11-05T14:59:59.999Z"), {
    reception: "open",
    receptionLabel: "접수 중",
    text: "D-2",
    tone: "accent",
    daysLeft: 2,
    dateTrusted: true,
    endDateLabel: "11.05",
  });
  const today = fixed("2026-11-03T14:59:59.999Z");
  assert.equal(today.text, "오늘 마감");
  assert.equal(today.tone, "accent-strong");
  assert.equal(today.daysLeft, 0);
  // A date-only value is the end of that day in Seoul, not UTC midnight.
  assert.equal(fixed("2026-11-03").text, "오늘 마감");
  assert.equal(fixed("2026-11-03").endDateLabel, "11.03");
});

test("deadlines without a trusted date never show a D-day", () => {
  for (const input of [
    { applicationEndAt: "2026-11-05T14:59:59.999Z", deadlineType: "unknown" },
    { deadlineType: "unknown" },
    {},
    { applicationEndAt: "not a date", deadlineType: "fixed" },
  ]) {
    const value = getDeadlineDisplay({ ...input, now });
    assert.equal(value.reception, "unconfirmed", JSON.stringify(input));
    assert.equal(value.text, "마감일은 원문에서 확인");
    assert.equal(value.receptionLabel, "마감일 확인 필요");
    assert.equal(value.daysLeft, null);
    assert.equal(value.dateTrusted, false);
    assert.equal(value.endDateLabel, null);
  }
});

test("no-date and finished receptions use words, not colour alone", () => {
  const ongoing = getDeadlineDisplay({ deadlineType: "ongoing", now });
  assert.deepEqual(
    [ongoing.text, ongoing.tone, ongoing.daysLeft],
    ["상시 모집", "ink", null],
  );
  const exhausted = getDeadlineDisplay({
    deadlineType: "until_exhausted",
    now,
  });
  assert.deepEqual([exhausted.text, exhausted.tone], ["소진 시 마감", "ink"]);
  const closed = fixed("2026-11-02T14:59:59.999Z");
  assert.deepEqual(
    [closed.text, closed.receptionLabel, closed.daysLeft],
    ["접수 종료", "접수 종료", null],
  );
  const scheduled = getDeadlineDisplay({
    applicationStartAt: "2026-11-10T00:00:00+09:00",
    applicationEndAt: "2026-11-20T23:59:59+09:00",
    deadlineType: "fixed",
    now,
  });
  assert.deepEqual(
    [scheduled.text, scheduled.receptionLabel],
    ["접수 예정", "접수 예정"],
  );
});

test("a poster closed by an operator is closed even before its end date", () => {
  const value = fixed("2026-11-20T14:59:59.999Z", { posterStatus: "closed" });
  assert.equal(value.reception, "closed");
  assert.equal(value.daysLeft, null);
  assert.equal(
    getPosterApplicationState({
      applicationEndAt: "2026-11-20T14:59:59.999Z",
      deadlineType: "fixed",
      posterStatus: "closed",
      now,
    }).status,
    "closed",
  );
});

test("7일 안에 마감 includes today and the next 6 days, trusted dates only", () => {
  assert.equal(isClosingWithinDays(fixed("2026-11-03T14:59:59.999Z")), true);
  assert.equal(isClosingWithinDays(fixed("2026-11-09T14:59:59.999Z")), true);
  assert.equal(isClosingWithinDays(fixed("2026-11-10T14:59:59.999Z")), false);
  assert.equal(
    isClosingWithinDays(
      getDeadlineDisplay({ deadlineType: "until_exhausted", now }),
    ),
    false,
  );
  assert.equal(
    isClosingWithinDays(
      getDeadlineDisplay({
        applicationEndAt: "2026-11-04T14:59:59.999Z",
        deadlineType: "unknown",
        now,
      }),
    ),
    false,
  );
});

// Codex review (a279e87): the shared status function infers a deadline from the
// date alone; only a fixed type may become a trusted D-day.
test("missing or non-fixed deadline types never become a trusted D-day", () => {
  for (const deadlineType of [undefined, null, "", "scheduled", "예정"]) {
    for (const applicationEndAt of [
      "2026-11-05T23:59:59+09:00",
      "2026-11-03T23:59:59+09:00",
    ]) {
      const value = getDeadlineDisplay({ applicationEndAt, deadlineType, now });
      const label = `${String(deadlineType)} ${applicationEndAt}`;
      assert.equal(value.dateTrusted, false, label);
      assert.equal(value.daysLeft, null, label);
      assert.equal(value.endDateLabel, null, label);
      assert.equal(value.reception, "unconfirmed", label);
      assert.equal(value.text, "마감일은 원문에서 확인", label);
      assert.equal(isClosingWithinDays(value), false, label);
    }
  }
  // The Korean alias of fixed stays trusted.
  assert.equal(
    getDeadlineDisplay({
      applicationEndAt: "2026-11-05T23:59:59+09:00",
      deadlineType: "고정",
      now,
    }).text,
    "D-2",
  );
});
