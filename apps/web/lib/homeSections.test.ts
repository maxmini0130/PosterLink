import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeSections,
  visitDateLabel,
  type HomeItem,
} from "./homeSections";

// 2026-11-03 12:00 KST
const now = new Date("2026-11-03T03:00:00.000Z");
const at = (iso: string) => Date.parse(iso);
const BASE = at("2026-10-28T10:00:00+09:00");

function item(
  id: string,
  {
    published = "2026-10-01T00:00:00+09:00",
    end,
    start,
    type = "fixed",
    institutions = [],
  }: {
    published?: string | null;
    end?: string;
    start?: string;
    type?: string;
    institutions?: string[];
  } = {},
): HomeItem<string> {
  return {
    id,
    publishedAt: published ? at(published) : null,
    institutionIds: institutions,
    application: {
      applicationStartAt: start,
      applicationEndAt: end,
      deadlineType: type,
    },
    data: id,
  };
}

const ids = (entries: Array<{ id: string }>) => entries.map((e) => e.id);
const base = {
  interest: [] as HomeItem<string>[],
  favorites: [] as HomeItem<string>[],
  followed: [] as HomeItem<string>[],
  followedInstitutionIds: [] as string[],
  now,
};

test("first visit: open interest posters only, unconfirmed and closed left out", () => {
  const home = buildHomeSections({
    ...base,
    baselineAt: null,
    interest: [
      item("open", { end: "2026-11-20T23:59:59+09:00" }),
      item("ongoing", { type: "ongoing" }),
      item("unconfirmed", { type: "unknown" }),
      item("closed", { end: "2026-10-30T23:59:59+09:00" }),
      item("scheduled", {
        start: "2026-11-10T00:00:00+09:00",
        end: "2026-11-20T23:59:59+09:00",
      }),
    ],
    favorites: [item("fav", { end: "2026-11-04T23:59:59+09:00" })],
  });
  assert.equal(home.state, "first");
  assert.deepEqual(ids(home.openInterest), ["open", "ongoing"]);
  assert.deepEqual(home.closingSoon, []);
  assert.equal(home.followGuide, false);
});

test("return visit with new posters: new since the baseline, 7-day deadlines, follows, started favorites", () => {
  const home = buildHomeSections({
    ...base,
    baselineAt: BASE,
    interest: [
      item("old", { end: "2026-11-05T23:59:59+09:00" }),
      item("new-a", {
        published: "2026-10-29T09:00:00+09:00",
        end: "2026-11-30T23:59:59+09:00",
      }),
      item("new-b", {
        published: "2026-11-02T09:00:00+09:00",
        type: "until_exhausted",
      }),
      item("new-closed", {
        published: "2026-10-30T09:00:00+09:00",
        end: "2026-11-01T23:59:59+09:00",
      }),
      item("unconfirmed-soon", {
        end: "2026-11-04T23:59:59+09:00",
        type: "unknown",
      }),
    ],
    favorites: [
      item("fav-later", { end: "2026-11-08T23:59:59+09:00" }),
      item("fav-started", {
        start: "2026-11-01T00:00:00+09:00",
        end: "2026-11-25T23:59:59+09:00",
      }),
      item("fav-started-before", {
        start: "2026-10-20T00:00:00+09:00",
        end: "2026-11-25T23:59:59+09:00",
      }),
    ],
    followed: [
      item("inst-new", {
        published: "2026-11-01T09:00:00+09:00",
        end: "2026-11-15T23:59:59+09:00",
        institutions: ["i1"],
      }),
      item("inst-old", {
        published: "2026-10-01T09:00:00+09:00",
        end: "2026-11-15T23:59:59+09:00",
        institutions: ["i2"],
      }),
    ],
    followedInstitutionIds: ["i1", "i2"],
  });
  assert.equal(home.state, "new");
  // Newest first; closed new posters are not "new interest posters".
  assert.deepEqual(ids(home.fresh), ["new-b", "new-a"]);
  // Trusted dates within 7 days only, favorites first, then soonest.
  assert.deepEqual(ids(home.closingSoon), ["fav-later", "old"]);
  assert.equal(home.closingSoon[0].favorite, true);
  assert.deepEqual(ids(home.startedFavorites), ["fav-started"]);
  assert.deepEqual(
    home.followedNews.map((group) => [group.institutionId, ids(group.items)]),
    [["i1", ["inst-new"]]],
  );
  assert.deepEqual(home.openInterest, []);
  assert.equal(home.followGuide, false);
});

test("return visit without new posters: quiet state, one guide card when nothing is saved", () => {
  const quiet = buildHomeSections({
    ...base,
    baselineAt: BASE,
    interest: [
      item("soon", { end: "2026-11-05T23:59:59+09:00" }),
      item("later", { end: "2026-11-30T23:59:59+09:00" }),
    ],
  });
  assert.equal(quiet.state, "quiet");
  assert.deepEqual(ids(quiet.closingSoon), ["soon"]);
  assert.equal(quiet.followGuide, true);
  assert.deepEqual(quiet.openInterest, []);

  // Nothing at all to show: falls back to open interest posters.
  const empty = buildHomeSections({
    ...base,
    baselineAt: BASE,
    interest: [item("later", { end: "2026-11-30T23:59:59+09:00" })],
    favorites: [item("fav", { end: "2026-12-30T23:59:59+09:00" })],
  });
  assert.equal(empty.state, "quiet");
  assert.deepEqual(ids(empty.openInterest), ["later"]);
  assert.equal(empty.followGuide, false); // has a favorite
});

test("the same poster in several sources is listed once", () => {
  const shared = item("shared", { end: "2026-11-04T23:59:59+09:00" });
  const home = buildHomeSections({
    ...base,
    baselineAt: BASE,
    interest: [shared, shared],
    favorites: [shared],
    followed: [shared],
  });
  assert.deepEqual(ids(home.closingSoon), ["shared"]);
});

test("the visit date is written in Korean for Asia/Seoul", () => {
  assert.equal(
    visitDateLabel(at("2026-10-28T23:30:00+09:00")),
    "10월 28일(수)",
  );
  // 23:30 UTC is already the next day in Seoul.
  assert.equal(visitDateLabel(at("2026-10-28T23:30:00Z")), "10월 29일(목)");
});

test("a date-only start counts from midnight in Seoul", () => {
  // 2026-11-03 08:00 KST: a start of "2026-11-03" has already begun.
  const early = new Date("2026-11-02T23:00:00.000Z");
  const home = buildHomeSections({
    ...base,
    now: early,
    baselineAt: BASE,
    favorites: [
      item("today", { start: "2026-11-03", end: "2026-11-20T23:59:59+09:00" }),
    ],
  });
  assert.deepEqual(ids(home.startedFavorites), ["today"]);
});
