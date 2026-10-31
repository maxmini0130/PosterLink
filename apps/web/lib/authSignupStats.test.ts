import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateSignupAccounts,
  readAuthorizedSignupStats,
  SignupStatsError,
} from "./authSignupStats";

const now = new Date("2026-10-23T03:00:00Z");
const account = (id: string, at = "2026-10-23T00:00:00Z") => ({
  id,
  created_at: at,
});
test("UTC creation timestamps use KST day/month and Monday week boundaries", () => {
  const result = aggregateSignupAccounts(
    [
      account("before-day", "2026-10-22T14:59:59Z"),
      account("day-start", "2026-10-22T15:00:00Z"),
      account("week-start", "2026-10-18T15:00:00Z"),
      account("month-start", "2026-09-30T15:00:00Z"),
      account("before-month", "2026-09-30T14:59:59Z"),
      account("at-cutoff", now.toISOString()),
    ],
    now,
  );
  assert.equal(result.totalAccounts, 5);
  assert.equal(result.today, 1);
  assert.equal(result.thisWeek, 3);
  assert.equal(result.thisMonth, 4);
  assert.equal(result.daily.length, 31);
  assert.deepEqual(result.daily.at(-1), { date: "2026-10-23", count: 1 });
});
test("one Auth ID is one account across logins, repeated callbacks, and linked identities", () => {
  const original = account("same");
  const accounts = [original, { ...original }, { ...original }];
  assert.equal(aggregateSignupAccounts(accounts, now).today, 1);
  // A new ID after deletion is a new account, not a recovered person.
  assert.equal(
    aggregateSignupAccounts([original, account("rejoined")], now).today,
    2,
  );
  assert.equal(aggregateSignupAccounts([], now).today, 0);
});
test("four providers are counted from Auth rows, failed signup has no row", () => {
  const rows = ["email", "kakao", "naver", "google"].map((id) => account(id));
  assert.equal(aggregateSignupAccounts(rows, now).today, 4);
});
test("invalid or conflicting Auth creation data fails instead of undercounting", () => {
  assert.throws(
    () => aggregateSignupAccounts([account("bad", "invalid")], now),
    SignupStatsError,
  );
  assert.throws(
    () =>
      aggregateSignupAccounts(
        [account("same"), account("same", "2026-10-22T00:00:00Z")],
        now,
      ),
    SignupStatsError,
  );
});
test("unauthenticated and non-super-admin actors never invoke privileged reads", async () => {
  for (const role of [null, "user", "operator", "admin"]) {
    let calls = 0;
    await assert.rejects(
      readAuthorizedSignupStats({
        actor: async () => (role === null ? null : { role }),
        page: async () => {
          calls++;
          return { users: [], total: 0, nextPage: null };
        },
      }),
      (e: SignupStatsError) => e.status === (role === null ? 401 : 403),
    );
    assert.equal(calls, 0);
  }
});
test("complete multi-page scan strips identifiers from the response", async () => {
  const result = await readAuthorizedSignupStats({
    actor: async () => ({ role: "super_admin" }),
    now: () => now,
    page: async (p, perPage) => ({
      users:
        perPage === 1
          ? [account("first")]
          : p === 1
            ? [account("first")]
            : [account("second")],
      total: 2,
      nextPage: perPage === 1 ? 2 : p === 1 ? 2 : null,
    }),
  });
  assert.equal(result.today, 2);
  assert.ok(!JSON.stringify(result).includes("first"));
  assert.ok(!JSON.stringify(result).includes("created_at"));
});
test("empty complete scan returns an explicit zero", async () => {
  const result = await readAuthorizedSignupStats({
    actor: async () => ({ role: "super_admin" }),
    now: () => now,
    page: async () => ({ users: [], total: 0, nextPage: null }),
  });
  assert.equal(result.totalAccounts, 0);
});
test("truncation, overlapping pages, changed totals and upstream failures fail closed", async () => {
  const variants = [
    async () => ({ users: [account("one")], total: 2, nextPage: null }),
    async () => ({ users: [account("one")], total: 2, nextPage: 2 }),
    async (p: number) => ({
      users: [account(String(p))],
      total: p === 1 ? 2 : 3,
      nextPage: p === 1 ? 2 : null,
    }),
    async () => {
      throw new SignupStatsError(503);
    },
    async () => ({ users: [], total: 50001, nextPage: null }),
  ];
  for (const page of variants)
    await assert.rejects(
      readAuthorizedSignupStats({
        actor: async () => ({ role: "super_admin" }),
        page,
      }),
      SignupStatsError,
    );
});
test("deletion during a scan is unavailable, not a fabricated exact result", async () => {
  await assert.rejects(
    readAuthorizedSignupStats({
      actor: async () => ({ role: "super_admin" }),
      page: async (_, perPage) => ({
        users: [account("one")],
        total: perPage === 1 ? 0 : 1,
        nextPage: null,
      }),
    }),
    SignupStatsError,
  );
});
