import assert from "node:assert/strict";
import test from "node:test";

import {
  GUEST_FAVORITES_KEY,
  GUEST_FAVORITES_MAX,
  PENDING_ACTION_KEY,
  PENDING_ACTION_TTL_MS,
  addGuestFavorite,
  clearPendingAction,
  completePendingActions,
  dismissMergeNotice,
  mergeGuestFavorites,
  readMergeNotice,
  rememberMergeNotice,
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

test("return paths are normalised and stay inside the app, off auth pages", () => {
  assert.equal(safeReturnTo(`/posters/${A}`), `/posters/${A}`);
  assert.equal(
    safeReturnTo("/institutions/mapo?tab=1#top"),
    "/institutions/mapo?tab=1#top",
  );
  // Dot segments resolve before the check; the normalised path is returned.
  assert.equal(safeReturnTo("/posters/x/../list"), "/posters/list");
  for (const bad of [
    "https://evil.example/",
    "//evil.example",
    "/\\evil",
    "posters/1",
    // Codex review 31abbbb: tab and newline are dropped by URL parsing.
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    // Codex review 31abbbb: dot segments must not reach auth pages.
    "/foo/../login",
    "/posters/%2e%2e/%2e%2e/login",
    "/./signup",
    "/login",
    "/login?x=1",
    "/login#x",
    "/auth/callback",
    "/onboarding",
    null,
    "",
    `/${"a".repeat(400)}`,
  ]) {
    assert.equal(safeReturnTo(bad), null, JSON.stringify(bad));
  }
});

test("a pending action has an id, lasts an hour and is dropped if tampered", () => {
  const store = memory();
  const now = 1_000_000;
  const id = setPendingAction(
    store,
    { type: "favorite", targetId: A, returnTo: `/posters/${A}` },
    now,
    "action-0001",
  );
  assert.equal(id, "action-0001");
  assert.deepEqual(readPendingAction(store, now + 1000), {
    id: "action-0001",
    type: "favorite",
    targetId: A,
    returnTo: `/posters/${A}`,
    createdAt: now,
  });
  // A generated id is used when none is given.
  assert.match(
    String(
      setPendingAction(
        store,
        { type: "follow", targetId: B, returnTo: "/" },
        now,
      ),
    ),
    /^[A-Za-z0-9-]{8,64}$/,
  );
  // Expired actions are removed when read.
  assert.equal(readPendingAction(store, now + PENDING_ACTION_TTL_MS), null);
  assert.equal(PENDING_ACTION_KEY in store.data, false);
  // Unsafe input is refused and nothing is stored.
  for (const action of [
    { type: "follow" as const, targetId: B, returnTo: "https://x.example" },
    { type: "favorite" as const, targetId: "x", returnTo: "/posters" },
    { type: "favorite" as const, targetId: A, returnTo: "/\t/evil.example" },
  ]) {
    assert.equal(
      setPendingAction(store, action, now),
      null,
      JSON.stringify(action),
    );
  }
  // Tampered records are dropped, including an unnormalised return path.
  for (const record of [
    {
      v: 2,
      id: "action-0002",
      type: "delete",
      targetId: A,
      returnTo: "/",
      createdAt: now,
    },
    {
      v: 2,
      id: "action-0002",
      type: "favorite",
      targetId: A,
      returnTo: "/foo/../login",
      createdAt: now,
    },
    { v: 1, type: "favorite", targetId: A, returnTo: "/", createdAt: now },
  ]) {
    store.setItem(PENDING_ACTION_KEY, JSON.stringify(record));
    assert.equal(readPendingAction(store, now), null, JSON.stringify(record));
    assert.equal(PENDING_ACTION_KEY in store.data, false);
  }
});

test("storing a pending action fails visibly when the browser refuses it", () => {
  const full: KeyValueStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => undefined,
  };
  assert.equal(
    setPendingAction(full, { type: "favorite", targetId: A, returnTo: "/" }, 1),
    null,
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

test("a completed action clears only itself; a newer one stored meanwhile is kept and run", async () => {
  const store = memory();
  const now = () => 1_000_000;
  setPendingAction(
    store,
    { type: "favorite", targetId: A, returnTo: `/posters/${A}` },
    now(),
    "action-aaaa",
  );
  const firstWrite = deferred<boolean>();
  const writes: string[] = [];
  const done: Array<[string, boolean]> = [];
  const run = completePendingActions({
    store,
    now,
    userId: async () => "user-1",
    complete: async (action) => {
      writes.push(action.id);
      return action.id === "action-aaaa" ? firstWrite.promise : true;
    },
    onDone: (action, current) => done.push([action.id, current]),
  });
  // Codex review 31abbbb: another tab stores B while A is being saved.
  await new Promise((resolve) => setTimeout(resolve, 0));
  setPendingAction(
    store,
    { type: "follow", targetId: B, returnTo: "/institutions/x" },
    now(),
    "action-bbbb",
  );
  firstWrite.resolve(true);
  await run;
  assert.deepEqual(writes, ["action-aaaa", "action-bbbb"]);
  // A was saved but replaced: no toast or return for it; B is completed and cleared.
  assert.deepEqual(done, [
    ["action-aaaa", false],
    ["action-bbbb", true],
  ]);
  assert.equal(readPendingAction(store, now()), null);
});

test("pending actions stay until signed in and until the write succeeds", async () => {
  const store = memory();
  const now = () => 1_000_000;
  setPendingAction(
    store,
    { type: "favorite", targetId: A, returnTo: "/" },
    now(),
    "action-cccc",
  );
  const done: unknown[] = [];
  const pass = (userId: string | null, ok: boolean) =>
    completePendingActions({
      store,
      now,
      userId: async () => userId,
      complete: async () => ok,
      onDone: (action) => done.push(action),
    });
  await pass(null, true);
  assert.equal(readPendingAction(store, now())?.id, "action-cccc");
  await pass("user-1", false);
  assert.equal(readPendingAction(store, now())?.id, "action-cccc");
  assert.equal(done.length, 0);
  await pass("user-1", true);
  assert.equal(readPendingAction(store, now()), null);
  assert.equal(done.length, 1);
  // Nothing left: another pass does nothing.
  await pass("user-1", true);
  assert.equal(done.length, 1);
});

test("one pass handles a bounded number of replacements", async () => {
  const store = memory();
  const now = () => 1_000_000;
  let n = 0;
  const next = () =>
    setPendingAction(
      store,
      { type: "favorite", targetId: A, returnTo: "/" },
      now(),
      `action-${String(n++).padStart(4, "0")}`,
    );
  next();
  let completes = 0;
  await completePendingActions({
    store,
    now,
    userId: async () => "user-1",
    // Every write is followed by a new action from elsewhere.
    complete: async () => {
      completes += 1;
      next();
      return true;
    },
    onDone: () => undefined,
    maxActions: 3,
  });
  assert.equal(completes, 3);
});

const C = "33333333-3333-4333-8333-333333333333";

test("merging moves every guest favorite once and clears them only after success", async () => {
  const store = memory();
  addGuestFavorite(store, A, 1);
  addGuestFavorite(store, B, 2);
  const upserts: string[][] = [];
  const result = await mergeGuestFavorites({
    store,
    existing: async () => [B], // the account already has B
    upsert: async (ids) => {
      upserts.push(ids);
      return true;
    },
  });
  assert.deepEqual(result, {
    status: "merged",
    count: 2,
    added: 1,
    duplicates: 1,
  });
  assert.deepEqual(upserts, [[A]]);
  assert.deepEqual(readGuestFavorites(store), []);
  // Nothing left: the next merge does nothing.
  assert.deepEqual(
    await mergeGuestFavorites({
      store,
      existing: async () => [],
      upsert: async () => true,
    }),
    { status: "none" },
  );
});

test("a failed merge keeps the guest favorites for a retry", async () => {
  for (const deps of [
    { existing: async () => null, upsert: async () => true },
    { existing: async () => [], upsert: async () => false },
  ]) {
    const store = memory();
    addGuestFavorite(store, A, 1);
    const result = await mergeGuestFavorites({ store, ...deps });
    assert.deepEqual(result, { status: "failed", count: 1 });
    assert.equal(hasGuestFavorite(store, A), true);
  }
});

test("a favorite saved during the merge stays for the next one", async () => {
  const store = memory();
  addGuestFavorite(store, A, 1);
  await mergeGuestFavorites({
    store,
    existing: async () => [],
    upsert: async () => {
      addGuestFavorite(store, C, 2); // another tab saves while the write runs
      return true;
    },
  });
  assert.deepEqual(
    readGuestFavorites(store).map((item) => item.posterId),
    [C],
  );
});

test("the merge notice is shown until dismissed", () => {
  const store = memory();
  assert.equal(readMergeNotice(store), null);
  rememberMergeNotice(store, 0, 1);
  assert.equal(readMergeNotice(store), null);
  rememberMergeNotice(store, 3, 1);
  assert.equal(readMergeNotice(store), 3);
  dismissMergeNotice(store);
  assert.equal(readMergeNotice(store), null);
});
