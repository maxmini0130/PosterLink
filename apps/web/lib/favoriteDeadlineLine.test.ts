import assert from "node:assert/strict";
import test from "node:test";

import { getDeadlinePresentation } from "./deadlinePresentation";
import { favoriteDeadlineLine } from "./favoriteDeadlineLine";

const NOW = new Date("2026-11-09T03:00:00Z"); // 11.9(월) 12:00 KST

function item(id: string, end: string, timeVerified: boolean, applied = false) {
  return {
    id,
    presentation: getDeadlinePresentation({
      deadlineType: "fixed",
      applicationEndAt: end,
      deadlineStatus: "verified",
      deadlineTimeVerified: timeVerified,
      receptionVerified: true,
      applied,
      now: NOW,
    }),
  };
}

test("one favourite closing in three days names the weekday and opens the poster", () => {
  const line = favoriteDeadlineLine(
    [item("a", "2026-11-12T18:00:00+09:00", true)],
    NOW,
  );
  assert.deepEqual(
    { text: line?.text, href: line?.href, stamp: line?.soonest.stamp },
    { text: "찜한 공고 1건 · 목요일 마감", href: "/posters/a", stamp: "D-3" },
  );
});

test("tomorrow, today, and a date-only last day", () => {
  assert.equal(
    favoriteDeadlineLine([item("a", "2026-11-10T18:00:00+09:00", true)], NOW)
      ?.text,
    "찜한 공고 1건 · 내일 마감",
  );
  assert.equal(
    favoriteDeadlineLine([item("a", "2026-11-09T18:00:00+09:00", true)], NOW)
      ?.text,
    "찜한 공고 1건 · 오늘 마감",
  );
  assert.equal(
    favoriteDeadlineLine([item("a", "2026-11-09T23:59:59+09:00", false)], NOW)
      ?.text,
    "찜한 공고 1건 · 오늘이 마감일",
  );
});

test("several favourites open the favourites list", () => {
  const line = favoriteDeadlineLine(
    [
      item("a", "2026-11-12T18:00:00+09:00", true),
      item("b", "2026-11-10T23:59:59+09:00", false),
    ],
    NOW,
  );
  assert.equal(line?.text, "찜한 공고 2건 · 3일 안에 마감");
  assert.equal(line?.href, "/my-posters");
  assert.equal(line?.soonest.stamp, "D-1");
});

test("no line for applied, unconfirmed or far deadlines", () => {
  assert.equal(
    favoriteDeadlineLine(
      [
        item("a", "2026-11-11T18:00:00+09:00", true, true),
        item("b", "2026-11-20T18:00:00+09:00", true),
        {
          id: "c",
          presentation: getDeadlinePresentation({
            deadlineType: "fixed",
            applicationEndAt: "2026-11-10T23:59:59+09:00",
            receptionVerified: true,
            now: NOW,
          }),
        },
      ],
      NOW,
    ),
    null,
  );
});
