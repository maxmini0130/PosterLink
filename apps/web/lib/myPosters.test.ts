import assert from "node:assert/strict";
import test from "node:test";

import { groupByReception, noDateNote } from "./myPosters";
import { getDeadlineDisplay } from "./deadlineDisplay";

// 2026-11-03 12:00 KST
const now = new Date("2026-11-03T03:00:00.000Z");
type Item = {
  id: string;
  end?: string;
  start?: string;
  type?: string;
  status?: string;
};
const input = (item: Item) => ({
  applicationStartAt: item.start,
  applicationEndAt: item.end,
  deadlineType: item.type,
  posterStatus: item.status,
  now,
});

test("favorites are grouped 접수 예정 → 접수 중 → 접수 종료, empty groups dropped", () => {
  const items: Item[] = [
    { id: "closed", end: "2026-10-30T23:59:59+09:00", type: "fixed" },
    { id: "later", end: "2026-11-20T23:59:59+09:00", type: "fixed" },
    { id: "ongoing", type: "ongoing" },
    { id: "soon", end: "2026-11-04T23:59:59+09:00", type: "fixed" },
    { id: "unconfirmed", end: "2026-11-05T23:59:59+09:00", type: "unknown" },
    {
      id: "operator-closed",
      end: "2026-11-30T23:59:59+09:00",
      type: "fixed",
      status: "closed",
    },
  ];
  const groups = groupByReception(items, input);
  assert.deepEqual(
    groups.map((group) => [
      group.label,
      group.items.map((entry) => entry.item.id),
    ]),
    [
      // Trusted deadlines first, soonest first; then the others in saved order.
      ["접수 중", ["soon", "later", "ongoing", "unconfirmed"]],
      ["접수 종료", ["closed", "operator-closed"]],
    ],
  );
  const scheduled = groupByReception(
    [
      {
        id: "next",
        start: "2026-11-10T00:00:00+09:00",
        end: "2026-11-20T23:59:59+09:00",
        type: "fixed",
      },
    ],
    input,
  );
  assert.deepEqual(
    scheduled.map((group) => group.label),
    ["접수 예정"],
  );
  assert.deepEqual(groupByReception([], input), []);
});

test("only deadlines without a date get the no-reminder note", () => {
  assert.equal(
    noDateNote(getDeadlineDisplay({ deadlineType: "ongoing", now })),
    "마감일이 없는 공고라 날짜 알림은 없어요",
  );
  assert.equal(
    noDateNote(getDeadlineDisplay({ deadlineType: "until_exhausted", now })),
    "마감일이 없는 공고라 날짜 알림은 없어요",
  );
  assert.equal(
    noDateNote(
      getDeadlineDisplay({
        applicationEndAt: "2026-11-05T23:59:59+09:00",
        deadlineType: "fixed",
        now,
      }),
    ),
    null,
  );
});
