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
    regions,
    eventEnd,
  }: {
    published?: string | null;
    end?: string;
    start?: string;
    type?: string;
    institutions?: string[];
    regions?: string[];
    eventEnd?: string;
  } = {},
): HomeItem<string> {
  return {
    id,
    publishedAt: published ? at(published) : null,
    institutionIds: institutions,
    regionIds: regions,
    application: {
      applicationStartAt: start,
      applicationEndAt: end,
      deadlineType: type,
      eventEndAt: eventEnd,
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

const REGIONS = [
  { id: "nation", name: "전국", level: "nation", parent_id: null },
  { id: "seoul", name: "서울특별시", level: "sido", parent_id: "nation" },
  { id: "mapo", name: "마포구", level: "sigungu", parent_id: "seoul" },
  { id: "eunpyeong", name: "은평구", level: "sigungu", parent_id: "seoul" },
];
const OPEN_END = "2026-11-30T23:59:59+09:00";

test("first visit: open posters in my area; unconfirmed, closed and finished events left out", () => {
  const home = buildHomeSections({
    ...base,
    baselineAt: null,
    interest: [
      item("open", { end: "2026-11-20T23:59:59+09:00" }),
      item("ongoing", { type: "ongoing" }),
      item("unconfirmed", { type: "unknown" }),
      item("closed", { end: "2026-10-30T23:59:59+09:00" }),
      item("ended-event", {
        type: "until_exhausted",
        eventEnd: "2026-10-25T14:59:59Z",
      }),
      item("scheduled", {
        start: "2026-11-10T00:00:00+09:00",
        end: "2026-11-20T23:59:59+09:00",
      }),
    ],
    favorites: [item("fav", { end: "2026-11-04T23:59:59+09:00" })],
  });
  assert.equal(home.state, "first");
  assert.equal(home.primaryKind, "open");
  assert.deepEqual(ids(home.primary), ["open", "ongoing"]);
  // 7-day deadlines are offered from the first visit (side list).
  assert.deepEqual(ids(home.closingSoon), ["fav"]);
});

test("my area, 서울·전국 and other districts are separate groups, each poster once", () => {
  const home = buildHomeSections({
    ...base,
    baselineAt: null,
    region: { selectedId: "mapo", regions: REGIONS },
    interest: [
      item("mapo-1", { end: OPEN_END, regions: ["mapo"] }),
      item("seoul-1", { end: OPEN_END, regions: ["seoul"] }),
      item("nation-1", { type: "ongoing", regions: ["nation"] }),
      item("mapo-and-seoul", { end: OPEN_END, regions: ["seoul", "mapo"] }),
      item("no-region", { end: OPEN_END }),
    ],
    nearby: [
      item("eunpyeong-1", { end: OPEN_END, regions: ["eunpyeong"] }),
      item("mapo-1", { end: OPEN_END, regions: ["mapo"] }),
    ],
  });
  assert.deepEqual(ids(home.primary), [
    "mapo-1",
    "mapo-and-seoul",
    "no-region",
  ]);
  assert.deepEqual(
    home.wider.map(({ entry, scope }) => [entry.id, scope.label]),
    [
      ["seoul-1", "서울 전체"],
      ["nation-1", "전국"],
    ],
  );
  assert.deepEqual(ids(home.nearby), ["eunpyeong-1"]);
  assert.deepEqual(home.latest, []);
});

test("return visit with new posters: new in my area, 7-day deadlines, follows, started favorites", () => {
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
  assert.equal(home.primaryKind, "fresh");
  // Newest first; closed new posters are not "new interest posters".
  assert.deepEqual(ids(home.primary), ["new-b", "new-a"]);
  // Trusted dates within 7 days only, favorites first, then soonest.
  assert.deepEqual(ids(home.closingSoon), ["fav-later", "old"]);
  assert.equal(home.closingSoon[0].favorite, true);
  assert.deepEqual(ids(home.startedFavorites), ["fav-started"]);
  assert.deepEqual(
    home.followedNews.map((group) => [group.institutionId, ids(group.items)]),
    [["i1", ["inst-new"]]],
  );
  assert.equal(home.followGuide, false);
});

test("return visit without new posters: open posters in my area, no repeat in the side list", () => {
  const quiet = buildHomeSections({
    ...base,
    baselineAt: BASE,
    interest: [
      item("soon", { end: "2026-11-05T23:59:59+09:00" }),
      item("later", { end: "2026-11-30T23:59:59+09:00" }),
    ],
  });
  assert.equal(quiet.state, "quiet");
  assert.deepEqual(ids(quiet.primary), ["soon", "later"]);
  // "soon" is already in the first grid page.
  assert.deepEqual(quiet.closingSoon, []);
  assert.equal(quiet.followGuide, true);
});

test("no matching posters: the newest posters are shown instead of an empty home", () => {
  const latest = [
    item("n1", { end: OPEN_END }),
    item("n2", { type: "unknown" }),
    item("n3", { type: "ongoing" }),
  ];
  const none = buildHomeSections({
    ...base,
    baselineAt: null,
    interest: [],
    latest,
  });
  assert.deepEqual(ids(none.latest), ["n1", "n3"]);
  // Without conditions the newest posters are the content too.
  const noInterest = buildHomeSections({
    ...base,
    baselineAt: null,
    hasInterest: false,
    interest: [item("a", { end: OPEN_END })],
    latest: [item("a", { end: OPEN_END }), ...latest],
  });
  assert.deepEqual(ids(noInterest.latest), ["n1", "n3"]);
  // With matches and conditions, no extra latest group.
  const matched = buildHomeSections({
    ...base,
    baselineAt: null,
    hasInterest: true,
    interest: [item("a", { end: OPEN_END })],
    latest,
  });
  assert.deepEqual(matched.latest, []);
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
  assert.deepEqual(ids(home.primary), ["shared"]);
  // Already in the grid, so not repeated in the 7-day list.
  assert.deepEqual(home.closingSoon, []);
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
