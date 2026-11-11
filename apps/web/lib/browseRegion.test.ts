import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSE_REGION_KEY,
  browseRegionLabel,
  browseRegionOwner,
  browsePosterScope,
  posterRegionCondition,
  posterRegionTag,
  readBrowseRegion,
  saveBrowseRegion,
  shortSidoName,
} from "./browseRegion";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const SEOUL = "11111111-1111-4111-8111-111111111111";
const MAPO = "22222222-2222-4222-8222-222222222222";

test("short 시·도 names and home titles follow the design", () => {
  assert.equal(shortSidoName("서울특별시"), "서울");
  assert.equal(shortSidoName("경기도"), "경기");
  assert.equal(shortSidoName("세종특별자치시"), "세종");
  assert.equal(shortSidoName("부산광역시"), "부산");
  assert.equal(shortSidoName("충청북도"), "충북");
  assert.equal(shortSidoName("제주특별자치도"), "제주");
  const seoul = { id: SEOUL, name: "서울특별시", level: "sido" };
  assert.equal(browseRegionLabel(seoul), "서울 전체");
  assert.equal(
    browseRegionLabel(
      { id: MAPO, name: "마포구", level: "sigungu", parent_id: SEOUL },
      seoul,
    ),
    "서울 마포구",
  );
  assert.equal(
    browseRegionLabel({ id: "n", name: "전국", level: "nation" }),
    "전국",
  );
  assert.equal(browseRegionLabel(null), null);
});

test("a browsed region is kept per owner and never shared", () => {
  const store = memory();
  const guest = browseRegionOwner(null);
  const member = browseRegionOwner("abc");
  assert.equal(guest, "guest");
  assert.equal(member, "user:abc");
  assert.equal(readBrowseRegion(store, guest), null);
  assert.ok(
    saveBrowseRegion(
      store,
      member,
      { regionId: MAPO, label: "서울 마포구" },
      1,
    ),
  );
  assert.deepEqual(readBrowseRegion(store, member), {
    regionId: MAPO,
    label: "서울 마포구",
  });
  // The guest in the same browser does not inherit the member's choice.
  assert.equal(readBrowseRegion(store, guest), null);
  assert.ok(
    saveBrowseRegion(store, guest, { regionId: SEOUL, label: "서울 전체" }, 2),
  );
  assert.equal(readBrowseRegion(store, member)?.regionId, MAPO);
  assert.equal(readBrowseRegion(store, guest)?.regionId, SEOUL);
});

test("bad records and blocked storage are ignored", () => {
  const store = memory();
  store.setItem(BROWSE_REGION_KEY, "{not json");
  assert.equal(readBrowseRegion(store, "guest"), null);
  store.setItem(
    BROWSE_REGION_KEY,
    JSON.stringify({ v: 1, owners: { guest: { regionId: "x", label: "a" } } }),
  );
  assert.equal(readBrowseRegion(store, "guest"), null);
  assert.equal(
    saveBrowseRegion(store, "guest", { regionId: "nope", label: "a" }, 1),
    false,
  );
  const blocked = {
    getItem: () => null,
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {},
  };
  assert.equal(
    saveBrowseRegion(
      blocked,
      "guest",
      { regionId: SEOUL, label: "서울 전체" },
      1,
    ),
    false,
  );
});

test("only the few most recent owners are kept", () => {
  const store = memory();
  for (let i = 0; i < 7; i += 1)
    saveBrowseRegion(
      store,
      `user:${i}`,
      { regionId: SEOUL, label: "서울 전체" },
      i,
    );
  assert.equal(readBrowseRegion(store, "user:0"), null);
  assert.equal(readBrowseRegion(store, "user:6")?.label, "서울 전체");
});

test("poster region tags use the most specific short name", () => {
  const seoul = { id: SEOUL, name: "서울특별시", level: "sido" };
  const mapo = { id: MAPO, name: "마포구", level: "sigungu" };
  const geumcheon = { id: "g", name: "금천구", level: "sigungu" };
  const nation = { id: "n", name: "전국", level: "nation" };
  assert.equal(posterRegionTag([mapo]), "마포구");
  assert.equal(posterRegionTag([seoul, mapo]), "마포구");
  assert.equal(posterRegionTag([geumcheon, mapo, seoul]), "금천구 외 1곳");
  assert.equal(posterRegionTag([seoul]), "서울");
  assert.equal(posterRegionTag([seoul, nation]), "서울");
  assert.equal(posterRegionTag([nation]), "전국");
  assert.equal(posterRegionTag([]), null);
});

const REGIONS = [
  { id: "nation", name: "전국", level: "nation", parent_id: null },
  { id: "seoul", name: "서울특별시", level: "sido", parent_id: null },
  { id: "busan", name: "부산광역시", level: "sido", parent_id: null },
  { id: "mapo", name: "마포구", level: "sigungu", parent_id: "seoul" },
  { id: "gangbuk", name: "강북구", level: "sigungu", parent_id: "seoul" },
  { id: "jongno", name: "종로구", level: "sigungu", parent_id: "seoul" },
];
const POSTERS = [
  { id: "mapo-only", regionIds: ["mapo"] },
  { id: "gangbuk-only", regionIds: ["gangbuk"] },
  // 서울시 공고 held in 강북구: the 서울 link keeps it in every 구.
  { id: "gangbuk+seoul", regionIds: ["gangbuk", "seoul"] },
  { id: "seoul", regionIds: ["seoul"] },
  { id: "nation", regionIds: ["nation"] },
  { id: "unlinked", regionIds: [] },
];
const scopeOf = (chosen: string | null) => {
  const result = browsePosterScope({
    chosen: REGIONS.find((r) => r.id === chosen) ?? null,
    defaultSidoId: "seoul",
    regions: REGIONS,
    posters: POSTERS,
  });
  return { ids: result.posters.map((p) => p.id), fallback: result.fallback };
};

test("a 구 view keeps its own, 서울-linked and nationwide posters", () => {
  assert.deepEqual(scopeOf("mapo"), {
    ids: ["mapo-only", "gangbuk+seoul", "seoul", "nation"],
    fallback: null,
  });
  assert.deepEqual(scopeOf("gangbuk").ids, [
    "gangbuk-only",
    "gangbuk+seoul",
    "seoul",
    "nation",
  ]);
});

test("서울 전체 chosen is the same view as nothing chosen", () => {
  const all = [
    "mapo-only",
    "gangbuk-only",
    "gangbuk+seoul",
    "seoul",
    "nation",
    "unlinked",
  ];
  assert.deepEqual(scopeOf(null), { ids: all, fallback: null });
  assert.deepEqual(scopeOf("seoul"), { ids: all, fallback: null });
  assert.deepEqual(scopeOf("nation").ids, all);
});

test("a region without its own posters says so and shows the wider ones", () => {
  // 부산: nothing of its own, so the nationwide posters.
  assert.deepEqual(scopeOf("busan"), { ids: ["nation"], fallback: "nation" });
  // 종로구: nothing of its own, so 서울 전체 and 전국.
  assert.deepEqual(scopeOf("jongno"), {
    ids: ["gangbuk+seoul", "seoul", "nation"],
    fallback: "sido",
  });
});

test("residents of one 구 only: that 구 and 서울 전체, never another 구", () => {
  const posters = [
    ...POSTERS,
    // 강북구민 only, also linked to 서울 (as some 구 office posters are).
    {
      id: "gangbuk-residents",
      regionIds: ["gangbuk", "seoul"],
      onlyIds: ["gangbuk"],
    },
  ];
  const ids = (chosen: string | null) =>
    browsePosterScope({
      chosen: REGIONS.find((r) => r.id === chosen) ?? null,
      defaultSidoId: "seoul",
      regions: REGIONS,
      posters,
    }).posters.map((p) => p.id);
  assert.ok(ids("gangbuk").includes("gangbuk-residents"));
  assert.ok(!ids("mapo").includes("gangbuk-residents"));
  assert.ok(ids(null).includes("gangbuk-residents"));
  assert.ok(ids("seoul").includes("gangbuk-residents"));
});

test("region conditions are shown only from data", () => {
  assert.deepEqual(posterRegionCondition({ onlyNames: ["강북구"] }), {
    kind: "only",
    text: "강북구 주민만 신청 가능",
  });
  // Not repeated while browsing that 구.
  assert.equal(
    posterRegionCondition({ onlyNames: ["강북구"], browsingGuName: "강북구" }),
    null,
  );
  assert.deepEqual(
    posterRegionCondition({
      onlyNames: [],
      eligibility: { kind: "gu_preferred", gus: ["강동구", "송파구"] },
    }),
    { kind: "preferred", text: "강동구·송파구 거주·생활권" },
  );
  // 우대 without a named 구, other kinds and bad data: nothing.
  assert.equal(
    posterRegionCondition({
      onlyNames: [],
      eligibility: { kind: "gu_preferred", gus: [] },
    }),
    null,
  );
  assert.equal(
    posterRegionCondition({
      onlyNames: [],
      eligibility: { kind: "seoul_wide", gus: [] },
    }),
    null,
  );
  assert.equal(
    posterRegionCondition({
      onlyNames: [],
      eligibility: { kind: "gu_preferred", gus: ["<b>"] },
    }),
    null,
  );
  assert.equal(posterRegionCondition({ onlyNames: [] }), null);
});
