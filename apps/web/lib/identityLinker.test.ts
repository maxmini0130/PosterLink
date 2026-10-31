import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_LINK_KEY,
  LINK_ERROR_BACKOFF_MS,
  PENDING_RETRY_DELAYS_MS,
  createIdentityLinker,
} from "./identityLinker";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function store() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** Fake clock + RPC whose answers are scripted per call. */
function harness(
  answers: Array<
    | { data: unknown; error: unknown }
    | (() => Promise<{ data: unknown; error: unknown }>)
  >,
) {
  let clock = 1_800_000_000_000;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextTimer = 1;
  const local = store();
  const session = store();
  const calls: number[] = [];
  let linkedCallbacks = 0;
  const linker = createIdentityLinker({
    link: async () => {
      calls.push(clock);
      const answer = answers.shift() ?? {
        data: null,
        error: { message: "unexpected call" },
      };
      return typeof answer === "function" ? answer() : answer;
    },
    local,
    session,
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { at: clock + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id as number),
    onLinked: () => void (linkedCallbacks += 1),
  });
  return {
    linker,
    local,
    calls,
    timers,
    linked: () => linkedCallbacks,
    async advance(ms: number) {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) {
          timers.delete(id);
          timer.fn();
        }
      }
      // let the async sync() triggered by a timer settle
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("pending before the profile exists is retried and links once (Codex review #1)", async () => {
  const h = harness([
    { data: "pending", error: null },
    { data: "signup", error: null },
  ]);
  assert.equal(await h.linker.sync(A), "pending");
  assert.equal(h.local.getItem(IDENTITY_LINK_KEY), null);
  assert.equal(h.timers.size, 1, "a retry is scheduled");

  await h.advance(PENDING_RETRY_DELAYS_MS[0]);
  assert.equal(h.calls.length, 2);
  assert.equal(h.local.getItem(IDENTITY_LINK_KEY), A);
  assert.equal(h.linked(), 1);
  assert.equal(h.timers.size, 0);
  assert.equal(
    await h.linker.sync(A),
    "skipped",
    "already linked in this storage",
  );
  assert.equal(h.calls.length, 2);
});

test("an explicit call after profile creation replaces the scheduled retry", async () => {
  const h = harness([
    { data: "pending", error: null },
    { data: "signup", error: null },
  ]);
  await h.linker.sync(A);
  assert.equal(await h.linker.sync(A), "signup");
  assert.equal(h.timers.size, 0);
  await h.advance(60_000);
  assert.equal(h.calls.length, 2, "no extra RPC from the cancelled timer");
});

test("pending retries stop after the configured attempts", async () => {
  const h = harness(
    Array.from({ length: 10 }, () => ({ data: "pending", error: null })),
  );
  await h.linker.sync(A);
  for (const delay of PENDING_RETRY_DELAYS_MS) await h.advance(delay);
  await h.advance(10 * 60_000);
  assert.equal(h.calls.length, 1 + PENDING_RETRY_DELAYS_MS.length);
  assert.equal(h.timers.size, 0);
});

test("sign-out and account switch cancel retries and ignore stale answers", async () => {
  const h = harness([{ data: "pending", error: null }]);
  await h.linker.sync(A);
  h.linker.signOut();
  assert.equal(h.timers.size, 0);
  await h.advance(60_000);
  assert.equal(h.calls.length, 1);

  let release!: (value: { data: unknown; error: unknown }) => void;
  const slow = harness([
    () => new Promise((resolve) => (release = resolve)),
    { data: "linked", error: null },
  ]);
  const first = slow.linker.sync(A);
  await new Promise((resolve) => setImmediate(resolve));
  const second = slow.linker.sync(B);
  release({ data: "signup", error: null });
  assert.equal(
    await first,
    "skipped",
    "A's late answer is not stored after switching to B",
  );
  assert.equal(await second, "linked");
  assert.equal(slow.local.getItem(IDENTITY_LINK_KEY), B);
});

test("RPC errors back off instead of retrying on every page", async () => {
  const h = harness([
    { data: null, error: { code: "PGRST202" } },
    { data: "linked", error: null },
  ]);
  assert.equal(await h.linker.sync(A), "error");
  assert.equal(await h.linker.sync(A), "skipped");
  await h.advance(LINK_ERROR_BACKOFF_MS + 1);
  assert.equal(await h.linker.sync(A), "linked");
  assert.equal(h.calls.length, 2);
});
