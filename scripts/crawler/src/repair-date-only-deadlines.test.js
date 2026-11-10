import assert from "node:assert/strict";
import test from "node:test";

import {
  endOfSeoulDay,
  hasStoredTimeHint,
  planDaily,
  planManifest,
  toSeoulText,
} from "./repair-date-only-deadlines.js";
import {
  DATE_ONLY_REPAIR_CHANGES,
  DATE_ONLY_REPAIR_KEEP,
} from "./date-only-deadline-manifest-20261110.js";

const ID = "00000000-0000-4000-8000-000000000001";
const change = {
  id: ID,
  title: "t",
  source: "s",
  date: "2026-11-30",
  expected: "2026-11-30 09:00:00",
};

test("seoul text and end of day", () => {
  assert.equal(toSeoulText("2026-11-30T00:00:00+00:00"), "2026-11-30 09:00:00");
  assert.equal(toSeoulText(endOfSeoulDay("2026-11-30")), "2026-11-30 23:59:59");
});

test("manifest updates only the value that was checked", () => {
  const [plan] = planManifest(
    [{ id: ID, application_end_at: "2026-11-30T00:00:00+00:00" }],
    [change],
  );
  assert.equal(plan.action, "update");
  assert.equal(plan.prev, "2026-11-30T00:00:00+00:00");
  assert.equal(plan.next, "2026-11-30T23:59:59+09:00");
});

test("manifest skips a row edited after the source check", () => {
  const [plan] = planManifest(
    [{ id: ID, application_end_at: "2026-12-05T00:00:00+00:00" }],
    [change],
  );
  assert.equal(plan.action, "changed-since-check");
  assert.equal(plan.next, undefined);
});

test("manifest is safe to run twice", () => {
  const [plan] = planManifest(
    [{ id: ID, application_end_at: "2026-11-30T14:59:59+00:00" }],
    [change],
  );
  assert.equal(plan.action, "already");
});

test("manifest reports a missing row", () => {
  assert.equal(planManifest([], [change])[0].action, "missing");
});

test("a 00:00 row keeps its Seoul date", () => {
  const [plan] = planManifest(
    [{ id: ID, application_end_at: "2026-11-09T15:00:00+00:00" }],
    [{ ...change, date: "2026-11-10", expected: "2026-11-10 00:00:00" }],
  );
  assert.equal(plan.action, "update");
  assert.equal(toSeoulText(plan.next), "2026-11-10 23:59:59");
});

test("a time stated in the source is used instead of the end of the day", () => {
  const timed = {
    ...change,
    date: "2026-12-31",
    expected: "2026-12-31 09:00:00",
    time: "19:00:00",
  };
  const [plan] = planManifest(
    [{ id: ID, application_end_at: "2026-12-31T00:00:00+00:00" }],
    [timed],
  );
  assert.equal(plan.action, "update");
  assert.equal(toSeoulText(plan.next), "2026-12-31 19:00:00");
  const [again] = planManifest(
    [{ id: ID, application_end_at: "2026-12-31T10:00:00+00:00" }],
    [timed],
  );
  assert.equal(again.action, "already");
});

test("time hints cover the forms found in the source check", () => {
  assert.equal(hasStoredTimeHint({ summary_long: "11/19 09:00까지" }), true);
  assert.equal(hasStoredTimeHint({ summary_long: "오후 6시 마감" }), true);
  assert.equal(hasStoredTimeHint({ summary_long: "18시까지 접수" }), true);
  assert.equal(
    hasStoredTimeHint({ summary_long: "11월 30일까지 신청" }),
    false,
  );
  assert.equal(
    hasStoredTimeHint({ summary_long: "교육시간 안내, 시설 이용" }),
    false,
  );
});

test("daily mode takes only future 09:00 rows with no time and not kept", () => {
  const row = (n, end, text = "11월 30일까지") => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    title: "t",
    application_end_at: end,
    summary_long: text,
  });
  const kept = row(1, "2026-11-30T00:00:00+00:00");
  const { update, skipped } = planDaily(
    [
      kept,
      row(2, "2026-11-30T00:00:00+00:00"),
      row(3, "2026-11-30T00:00:00+00:00", "접수 18:00까지"),
      row(4, "2026-11-30T14:59:59+00:00"),
      row(5, "2026-11-30T09:00:00+00:00"),
      row(6, "2026-11-09T00:00:00+00:00"),
    ],
    new Set([kept.id]),
    "2026-11-10",
  );
  assert.deepEqual(
    update.map((item) => item.id.slice(-1)),
    ["2"],
  );
  assert.equal(update[0].next, "2026-11-30T23:59:59+09:00");
  assert.deepEqual(
    skipped.map((item) => item.id.slice(-1)),
    ["3"],
  );
});

test("the source-checked manifest has no overlap and full ids", () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const changes = DATE_ONLY_REPAIR_CHANGES.map((row) => row.id);
  const keep = DATE_ONLY_REPAIR_KEEP.map((row) => row.id);
  assert.ok([...changes, ...keep].every((id) => uuid.test(id)));
  assert.equal(
    new Set([...changes, ...keep]).size,
    changes.length + keep.length,
  );
  for (const row of DATE_ONLY_REPAIR_CHANGES)
    assert.equal(row.expected.slice(0, 10), row.date);
});

test("manifest entries have text sources and well-formed times", () => {
  for (const row of DATE_ONLY_REPAIR_CHANGES) {
    assert.equal(typeof row.source, "string");
    if (row.time !== undefined) assert.match(row.time, /^\d{2}:\d{2}:\d{2}$/);
  }
});
