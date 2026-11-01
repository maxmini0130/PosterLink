import assert from "node:assert/strict";
import test from "node:test";

import {
  OWN_LIMIT,
  searchInterestGroups,
  searchNearby,
  splitRegionScope,
  type OpenSearch,
} from "./homeQueries";

const REGIONS = [
  { id: "nation", name: "전국", level: "nation", parent_id: null },
  // Production 시·도 rows have no parent link to 전국.
  { id: "seoul", name: "서울특별시", level: "sido", parent_id: null },
  { id: "mapo", name: "마포구", level: "sigungu", parent_id: "seoul" },
  { id: "eunpyeong", name: "은평구", level: "sigungu", parent_id: "seoul" },
];

type Row = { id: string; region: string; category: string; created: number };

/** Newest first within the requested regions and category, like the RPC. */
function fakeSearch(rows: Row[]) {
  const calls: Array<[string | null, string[] | null, number]> = [];
  const search: OpenSearch<Row> = async (categoryId, regionIds, limit) => {
    calls.push([categoryId, regionIds, limit]);
    return {
      data: rows
        .filter(
          (row) =>
            (!categoryId || row.category === categoryId) &&
            (!regionIds || regionIds.includes(row.region)),
        )
        .sort((a, b) => b.created - a.created)
        .slice(0, limit),
      error: null,
    };
  };
  return { search, calls };
}

test("my area and the areas above it are separate groups", () => {
  assert.deepEqual(splitRegionScope("seoul", REGIONS), {
    own: ["seoul", "mapo", "eunpyeong"],
    wider: ["nation"],
  });
  assert.deepEqual(splitRegionScope("mapo", REGIONS), {
    own: ["mapo"],
    wider: ["seoul", "nation"],
  });
});

test("many newer 전국 posters never push an older poster in my area out", async () => {
  // Codex review P2-3: 61 newer nationwide posters and 1 older Seoul poster.
  const rows: Row[] = [
    ...Array.from({ length: OWN_LIMIT + 1 }, (_, i) => ({
      id: `nation-${i}`,
      region: "nation",
      category: "edu",
      created: 1000 + i,
    })),
    { id: "seoul-old", region: "seoul", category: "edu", created: 1 },
  ];
  const { search, calls } = fakeSearch(rows);
  const found = await searchInterestGroups({
    regionId: "seoul",
    regions: REGIONS,
    categoryIds: ["edu"],
    search,
  });
  assert.ok(found.some((row) => row.id === "seoul-old"));
  assert.deepEqual(
    calls.map(([category, regions]) => [category, regions]),
    [
      ["edu", ["seoul", "mapo", "eunpyeong"]],
      ["edu", ["nation"]],
    ],
  );
});

test("other districts are searched with the chosen categories, not filtered after a cut", async () => {
  const rows: Row[] = [
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `other-${i}`,
      region: "eunpyeong",
      category: "sports",
      created: 1000 + i,
    })),
    { id: "eunpyeong-edu", region: "eunpyeong", category: "edu", created: 1 },
  ];
  const { search, calls } = fakeSearch(rows);
  const nearby = await searchNearby({
    regionId: "mapo",
    regions: REGIONS,
    categoryIds: ["edu"],
    search,
  });
  assert.deepEqual(
    nearby.map((row) => row.id),
    ["eunpyeong-edu"],
  );
  assert.deepEqual(calls[0].slice(0, 2), ["edu", ["eunpyeong"]]);
  // A 시·도 has no "other districts" group.
  assert.deepEqual(
    await searchNearby({
      regionId: "seoul",
      regions: REGIONS,
      categoryIds: ["edu"],
      search,
    }),
    [],
  );
});
