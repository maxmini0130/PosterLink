import assert from "node:assert/strict";
import test from "node:test";

import {
  addGuestApplied,
  readCreatedByApply,
  readGuestApplied,
  rememberApplyOpened,
  rememberApplyPrompted,
  removeGuestApplied,
  setCreatedByApply,
  shouldAskApplied,
  APPLY_RETURN_WINDOW_MS,
} from "./appliedPosters";
import type { KeyValueStore } from "./guestStore";

function memory(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const A = "56a42e3b-b0b6-43d9-98d6-dfb4a0310859";
const B = "86d33f6a-bd33-47e9-a56b-3a81e636be7e";

test("guest marks: add, newest first, no duplicates, undo", () => {
  const store = memory();
  assert.equal(addGuestApplied(store, A, 1), true);
  assert.equal(addGuestApplied(store, B, 2), true);
  assert.equal(addGuestApplied(store, A, 3), true);
  assert.deepEqual(readGuestApplied(store), [
    { posterId: A, appliedAt: 3 },
    { posterId: B, appliedAt: 2 },
  ]);
  removeGuestApplied(store, A);
  assert.deepEqual(
    readGuestApplied(store).map((item) => item.posterId),
    [B],
  );
  assert.equal(addGuestApplied(store, "not-an-id", 4), false);
});

test("broken or foreign stored values read as empty", () => {
  const store = memory();
  store.setItem("pl.guest_applied.v1", "{not json");
  assert.deepEqual(readGuestApplied(store), []);
  store.setItem("pl.guest_applied.v1", JSON.stringify({ v: 2, items: [] }));
  assert.deepEqual(readGuestApplied(store), []);
});

test("asked once: only after opening the application page, only if not marked", () => {
  const session = memory();
  const local = memory();
  const ask = (applied = false, now = 10_000) =>
    shouldAskApplied({ session, local, posterId: A, applied, now });
  assert.equal(ask(), false); // never opened
  rememberApplyOpened(session, A, 1000);
  assert.equal(ask(), true);
  assert.equal(ask(true), false); // already marked
  assert.equal(
    shouldAskApplied({
      session,
      local,
      posterId: B,
      applied: false,
      now: 10_000,
    }),
    false,
  ); // another poster
  assert.equal(ask(false, 1000 + APPLY_RETURN_WINDOW_MS), false); // too late
  rememberApplyPrompted(local, A);
  assert.equal(ask(), false); // never twice
});

test("member favourites created by a mark are remembered for undo", () => {
  const store = memory();
  setCreatedByApply(store, A, true);
  assert.equal(readCreatedByApply(store).has(A), true);
  setCreatedByApply(store, A, false);
  assert.equal(readCreatedByApply(store).has(A), false);
});
