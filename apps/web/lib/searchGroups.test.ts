import assert from "node:assert/strict";
import test from "node:test";

import type { KeyValueStore } from "./guestStore";
import {
  SAVED_SEARCHES_MAX,
  groupByRegionScope,
  isSavedSearch,
  readSavedSearches,
  removeSavedSearch,
  saveSearch,
  type RegionNode,
} from "./searchGroups";

const regions: RegionNode[] = [
  { id: "kr", name: "전국", level: "nation", parent_id: null },
  { id: "seoul", name: "서울특별시", level: "sido", parent_id: "kr" },
  { id: "mapo", name: "마포구", level: "sigungu", parent_id: "seoul" },
  { id: "mapo-dong", name: "상암동", level: "eupmyeondong", parent_id: "mapo" },
  { id: "gyeonggi", name: "경기도", level: "sido", parent_id: "kr" },
];

type P = { id: string; regionIds?: string[] };
const posters: P[] = [
  { id: "mapo", regionIds: ["mapo"] },
  { id: "dong", regionIds: ["mapo-dong"] },
  { id: "nation", regionIds: ["kr"] },
  { id: "seoul", regionIds: ["seoul"] },
  { id: "both", regionIds: ["seoul", "kr"] },
  { id: "unlinked" },
];

test("a district search keeps 서울 전체 and 전국 posters apart, labelled", () => {
  const groups = groupByRegionScope(
    posters,
    (p) => p.regionIds,
    "mapo",
    regions,
  );
  assert.deepEqual(
    groups.matched.map((p) => p.id),
    ["mapo", "dong", "unlinked"],
  );
  assert.deepEqual(
    groups.wider.map(({ item, scope }) => [item.id, scope.label]),
    [
      ["seoul", "서울 전체"],
      ["both", "서울 전체"],
      ["nation", "전국"],
    ],
  );
});

test("a province search uses its own short name; no region means one group", () => {
  const groups = groupByRegionScope(
    [
      { id: "g", regionIds: ["gyeonggi"] },
      { id: "n", regionIds: ["kr"] },
    ],
    (p: P) => p.regionIds,
    "gyeonggi",
    regions,
  );
  assert.deepEqual(
    groups.matched.map((p) => p.id),
    ["g"],
  );
  assert.deepEqual(groups.wider[0].scope, {
    regionId: "kr",
    label: "전국",
    nation: true,
  });
  const none = groupByRegionScope(posters, (p) => p.regionIds, null, regions);
  assert.equal(none.matched.length, posters.length);
  assert.deepEqual(none.wider, []);
  const nation = groupByRegionScope(posters, (p) => p.regionIds, "kr", regions);
  assert.equal(nation.matched.length, posters.length);
});

test("전국 stays the widest scope when the 시·도 has no parent link", () => {
  const unlinked = regions.map((region) =>
    region.level === "sido" ? { ...region, parent_id: null } : region,
  );
  const groups = groupByRegionScope(
    posters,
    (p) => p.regionIds,
    "mapo",
    unlinked,
  );
  assert.deepEqual(
    groups.wider.map(({ item, scope }) => [item.id, scope.label]),
    [
      ["seoul", "서울 전체"],
      ["both", "서울 전체"],
      ["nation", "전국"],
    ],
  );
  const province = groupByRegionScope(
    [{ id: "n", regionIds: ["kr"] }],
    (p: P) => p.regionIds,
    "seoul",
    unlinked,
  );
  assert.deepEqual(province.wider[0].scope.label, "전국");
});

function memory(): KeyValueStore {
  const data: Record<string, string> = {};
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

test("saved conditions: newest first, no duplicates or empty ones, capped", () => {
  const store = memory();
  assert.equal(
    saveSearch(store, { regionId: null, categoryId: null }, 1),
    false,
  );
  saveSearch(store, { regionId: "mapo", categoryId: "culture" }, 1);
  saveSearch(store, { regionId: "seoul", categoryId: "edu" }, 2);
  saveSearch(store, { regionId: "mapo", categoryId: "culture" }, 3);
  assert.deepEqual(
    readSavedSearches(store).map((item) => [item.regionId, item.categoryId]),
    [
      ["mapo", "culture"],
      ["seoul", "edu"],
    ],
  );
  assert.equal(
    isSavedSearch(readSavedSearches(store), {
      regionId: "seoul",
      categoryId: "edu",
    }),
    true,
  );
  removeSavedSearch(store, { regionId: "seoul", categoryId: "edu" });
  assert.equal(readSavedSearches(store).length, 1);
  for (let i = 0; i < 10; i++)
    saveSearch(store, { regionId: `r${i}`, categoryId: null }, 10 + i);
  assert.equal(readSavedSearches(store).length, SAVED_SEARCHES_MAX);
  assert.equal(readSavedSearches(store)[0].regionId, "r9");
});

test("saved conditions survive bad data and a blocked browser", () => {
  const bad = memory();
  bad.setItem("pl.saved_searches.v1", "{not json");
  assert.deepEqual(readSavedSearches(bad), []);
  const blocked: KeyValueStore = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => undefined,
  };
  assert.deepEqual(readSavedSearches(blocked), []);
  assert.equal(
    saveSearch(blocked, { regionId: "a", categoryId: null }, 1),
    false,
  );
});
