import assert from "node:assert/strict";
import test from "node:test";

import {
  GUEST_FAVORITES_KEY,
  GUEST_FAVORITES_MAX,
  PENDING_ACTION_KEY,
  PENDING_ACTION_TTL_MS,
  addGuestFavorite,
  clearPendingAction,
  hasGuestFavorite,
  readGuestFavorites,
  readPendingAction,
  removeGuestFavorite,
  safeReturnTo,
  setPendingAction,
  type KeyValueStore,
} from "./guestStore";

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

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("guest favorites add newest first, dedupe, remove and survive bad data", () => {
  const store = memory();
  assert.deepEqual(readGuestFavorites(store), []);
  assert.equal(addGuestFavorite(store, A, 1), true);
  assert.equal(addGuestFavorite(store, B, 2), true);
  assert.equal(addGuestFavorite(store, A, 3), true);
  assert.deepEqual(
    readGuestFavorites(store).map((item) => [item.posterId, item.savedAt]),
    [
      [A, 3],
      [B, 2],
    ],
  );
  assert.equal(hasGuestFavorite(store, B), true);
  removeGuestFavorite(store, B);
  assert.equal(hasGuestFavorite(store, B), false);
  assert.equal(addGuestFavorite(store, "not-a-uuid", 4), false);

  for (const raw of ["{", "[]", '{"v":2,"items":[]}', '{"v":1,"items":"x"}']) {
    assert.deepEqual(
      readGuestFavorites(memory({ [GUEST_FAVORITES_KEY]: raw })),
      [],
      raw,
    );
  }
  // Duplicate and malformed entries in stored data are dropped on read.
  const messy = memory({
    [GUEST_FAVORITES_KEY]: JSON.stringify({
      v: 1,
      items: [
        { posterId: A, savedAt: 5 },
        { posterId: A },
        { posterId: "x" },
        null,
      ],
    }),
  });
  assert.deepEqual(readGuestFavorites(messy), [{ posterId: A, savedAt: 5 }]);
});

test("guest favorites are capped and blocked storage does not throw", () => {
  const store = memory();
  for (let i = 0; i < GUEST_FAVORITES_MAX + 5; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    addGuestFavorite(store, id, i);
  }
  assert.equal(readGuestFavorites(store).length, GUEST_FAVORITES_MAX);
  const blocked: KeyValueStore = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readGuestFavorites(blocked), []);
  assert.equal(addGuestFavorite(blocked, A, 1), false);
  assert.equal(readPendingAction(blocked, 1), null);
  clearPendingAction(blocked);
});

test("return paths stay inside the app and skip auth pages", () => {
  assert.equal(safeReturnTo(`/posters/${A}`), `/posters/${A}`);
  assert.equal(
    safeReturnTo("/institutions/mapo?tab=1"),
    "/institutions/mapo?tab=1",
  );
  for (const bad of [
    "https://evil.example/",
    "//evil.example",
    "/\\evil",
    "posters/1",
    "/login",
    "/login?x=1",
    "/auth/callback",
    "/onboarding",
    "/signup",
    null,
    `/${"a".repeat(400)}`,
  ]) {
    assert.equal(safeReturnTo(bad), null, String(bad));
  }
});

test("a pending action is kept for an hour and only once valid", () => {
  const store = memory();
  const now = 1_000_000;
  assert.equal(
    setPendingAction(
      store,
      { type: "favorite", targetId: A, returnTo: `/posters/${A}` },
      now,
    ),
    true,
  );
  assert.deepEqual(readPendingAction(store, now + 1000), {
    type: "favorite",
    targetId: A,
    returnTo: `/posters/${A}`,
    createdAt: now,
  });
  // Expired actions are removed when read.
  assert.equal(readPendingAction(store, now + PENDING_ACTION_TTL_MS), null);
  assert.equal(PENDING_ACTION_KEY in store.data, false);
  // Unsafe targets are refused.
  assert.equal(
    setPendingAction(
      store,
      { type: "follow", targetId: B, returnTo: "https://x.example" },
      now,
    ),
    false,
  );
  assert.equal(
    setPendingAction(
      store,
      { type: "favorite", targetId: "x", returnTo: "/posters" },
      now,
    ),
    false,
  );
  // Tampered records are dropped.
  store.setItem(
    PENDING_ACTION_KEY,
    JSON.stringify({
      v: 1,
      type: "delete",
      targetId: A,
      returnTo: "/",
      createdAt: now,
    }),
  );
  assert.equal(readPendingAction(store, now), null);
  assert.equal(PENDING_ACTION_KEY in store.data, false);
});
