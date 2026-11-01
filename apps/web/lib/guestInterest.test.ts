import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTRY_KEY,
  GUEST_INTEREST_KEY,
  GUEST_INTEREST_MAX_CATEGORIES,
  clearGuestInterest,
  clearGuestInterestIf,
  markInterestOffered,
  readEntry,
  readGuestInterest,
  recordEntry,
  saveGuestInterest,
  shouldOfferInterestPicker,
  wasInterestOffered,
} from "./guestInterest";
import type { KeyValueStore } from "./guestStore";

function memory(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const R = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";

test("conditions round-trip, deduplicated, and nothing chosen clears them", () => {
  const store = memory();
  assert.equal(readGuestInterest(store), null);
  assert.ok(
    saveGuestInterest(store, { regionId: R, categoryIds: [C1, C2, C1] }, 5),
  );
  assert.deepEqual(readGuestInterest(store), {
    regionId: R,
    categoryIds: [C1, C2],
    savedAt: 5,
  });
  assert.ok(saveGuestInterest(store, { regionId: null, categoryIds: [] }, 6));
  assert.equal(store.data[GUEST_INTEREST_KEY], undefined);
  saveGuestInterest(store, { regionId: null, categoryIds: [C1] }, 7);
  clearGuestInterest(store);
  assert.equal(readGuestInterest(store), null);
});

test("stored conditions are read defensively", () => {
  for (const raw of [
    "not json",
    JSON.stringify({ v: 2, regionId: R, categoryIds: [] }),
    JSON.stringify({ v: 1, regionId: "x", categoryIds: ["y"] }),
    JSON.stringify({ v: 1, regionId: null, categoryIds: null }),
  ])
    assert.equal(
      readGuestInterest(memory({ [GUEST_INTEREST_KEY]: raw })),
      null,
    );
  const many = Array.from(
    { length: 30 },
    (_, i) => `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`,
  );
  const store = memory({
    [GUEST_INTEREST_KEY]: JSON.stringify({
      v: 1,
      regionId: "bad",
      categoryIds: [...many, 3],
    }),
  });
  const read = readGuestInterest(store)!;
  assert.equal(read.regionId, null);
  assert.equal(read.categoryIds.length, GUEST_INTEREST_MAX_CATEGORIES);
  assert.equal(read.savedAt, 0);
});

test("a blocked browser store reports that nothing was saved", () => {
  const store: KeyValueStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(
    saveGuestInterest(store, { regionId: R, categoryIds: [] }, 1),
    false,
  );
  assert.doesNotThrow(() => clearGuestInterest(store));
});

test("the entry page is the first page of the tab", () => {
  const session = memory();
  recordEntry(session, { path: "/", search: "", referrer: "" });
  recordEntry(session, {
    path: "/posters/x",
    search: "?a=1",
    referrer: "https://x",
  });
  assert.deepEqual(readEntry(session), {
    path: "/",
    search: "",
    referred: false,
  });
  assert.equal(readEntry(memory({ [ENTRY_KEY]: "{}" })), null);
});

test("the picker opens by itself only on a direct first opening of the home", () => {
  const base = {
    signedIn: false,
    interest: null,
    offered: false,
    firstVisit: true,
    entry: { path: "/", search: "", referred: false },
  };
  assert.equal(shouldOfferInterestPicker(base), true);
  const no = [
    { signedIn: true },
    { interest: { regionId: R, categoryIds: [], savedAt: 1 } },
    { offered: true },
    { firstVisit: false },
    { entry: null },
    // shared link or search result: the tab started on a poster
    { entry: { path: "/posters/abc", search: "", referred: false } },
    // notification or campaign link with parameters
    { entry: { path: "/", search: "?utm_source=push", referred: false } },
    // arrived from another site (search engine, messenger web)
    { entry: { path: "/", search: "", referred: true } },
  ];
  for (const change of no)
    assert.equal(
      shouldOfferInterestPicker({ ...base, ...change }),
      false,
      JSON.stringify(change),
    );
});

test("offering is remembered", () => {
  const store = memory();
  assert.equal(wasInterestOffered(store), false);
  markInterestOffered(store, 1);
  assert.equal(wasInterestOffered(store), true);
});

test("clearing nothing-chosen reports a blocked browser store", () => {
  const store = memory();
  saveGuestInterest(store, { regionId: R, categoryIds: [] }, 1);
  const blocked: KeyValueStore = {
    ...store,
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(
    saveGuestInterest(blocked, { regionId: null, categoryIds: [] }, 2),
    false,
  );
  assert.equal(clearGuestInterest(blocked), false);
  assert.notEqual(readGuestInterest(store), null);
});

test("after the account save only the moved conditions are cleared", () => {
  const store = memory();
  saveGuestInterest(store, { regionId: R, categoryIds: [C1] }, 10);
  const moved = readGuestInterest(store)!;
  assert.equal(clearGuestInterestIf(store, moved), true);
  assert.equal(readGuestInterest(store), null);

  // Another tab chose B while the account save of A was running: B stays.
  saveGuestInterest(store, { regionId: R, categoryIds: [C1] }, 20);
  const a = readGuestInterest(store)!;
  saveGuestInterest(store, { regionId: R, categoryIds: [C2] }, 21);
  assert.equal(clearGuestInterestIf(store, a), false);
  assert.deepEqual(readGuestInterest(store)?.categoryIds, [C2]);
  // Same choice saved again later is also a different record.
  saveGuestInterest(store, { regionId: R, categoryIds: [C1] }, 30);
  assert.equal(clearGuestInterestIf(store, a), false);
});
