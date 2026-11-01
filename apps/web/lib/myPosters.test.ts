import assert from "node:assert/strict";
import test from "node:test";

import { createReadWriteGate, groupByReception, noDateNote } from "./myPosters";
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

test("favorites are grouped 접수 예정 → 접수 중 → 확인 필요 → 접수 종료, empty groups dropped", () => {
  const items: Item[] = [
    { id: "closed", end: "2026-10-30T23:59:59+09:00", type: "fixed" },
    { id: "later", end: "2026-11-20T23:59:59+09:00", type: "fixed" },
    { id: "ongoing", type: "ongoing" },
    { id: "soon", end: "2026-11-04T23:59:59+09:00", type: "fixed" },
    { id: "unconfirmed", end: "2026-11-05T23:59:59+09:00", type: "unknown" },
    { id: "no-dates", type: "unknown" },
    { id: "no-type-no-dates" },
    { id: "unparseable", end: "추후 공지", type: "fixed" },
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
      ["접수 중", ["soon", "later", "ongoing"]],
      // Never claimed to be open when the schedule is not confirmed.
      [
        "접수 일정 확인 필요",
        ["unconfirmed", "no-dates", "no-type-no-dates", "unparseable"],
      ],
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

test("a read that started before a write never overwrites it", () => {
  const gate = createReadWriteGate();
  // Reload (e.g. after the guest merge) starts, then the person marks 신청.
  const read = gate.beginRead();
  assert.notEqual(read, null);
  gate.beginWrite();
  assert.equal(gate.endRead(read!), false); // old row: dropped
  assert.equal(gate.endWrite(), true); // read again after the write
  const again = gate.beginRead();
  assert.equal(gate.endRead(again!), true);
});

test("a read asked for during writes waits until the last write ends", () => {
  const gate = createReadWriteGate();
  gate.beginWrite(); // 찜 취소 on one card
  gate.beginWrite(); // 신청 표시 on another
  assert.equal(gate.beginRead(), null); // merge event meanwhile: deferred
  assert.equal(gate.endWrite(), false);
  assert.equal(gate.endWrite(), true);
  // Without an interrupted read there is nothing to redo.
  gate.beginWrite();
  assert.equal(gate.endWrite(), false);
});

test("only the newest of overlapping reads is applied", () => {
  const gate = createReadWriteGate();
  const first = gate.beginRead()!;
  const second = gate.beginRead()!;
  assert.equal(gate.endRead(second), true);
  assert.equal(gate.endRead(first), false);
});
