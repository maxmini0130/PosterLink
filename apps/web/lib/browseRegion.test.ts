import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSE_REGION_KEY,
  browseRegionLabel,
  browseRegionOwner,
  inBrowsedDistrict,
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

test("a 구 view keeps its own, 서울-wide and nationwide posters only", () => {
  const level: Record<string, string> = {
    seoul: "sido",
    nation: "nation",
    mapo: "sigungu",
    gangbuk: "sigungu",
  };
  const mapoScope = new Set(["mapo", "seoul", "nation"]);
  const inMapo = (ids: string[]) =>
    inBrowsedDistrict(ids, (id) => level[id], mapoScope);
  assert.equal(inMapo(["mapo"]), true);
  assert.equal(inMapo(["mapo", "seoul"]), true);
  assert.equal(inMapo(["seoul"]), true);
  assert.equal(inMapo(["nation"]), true);
  assert.equal(inMapo(["seoul", "nation"]), true);
  // Linked to 강북구 and to 서울: a 강북구 poster, not a 마포구 one.
  assert.equal(inMapo(["gangbuk", "seoul"]), false);
  assert.equal(inMapo(["gangbuk", "mapo", "seoul"]), true);
  assert.equal(inMapo([]), false);
});
