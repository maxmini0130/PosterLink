import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChecks,
  formatMarkdown,
  judge,
  runChecks,
  SLOW_MS,
} from "./uptime-check.mjs";

const env = {
  SUPABASE_URL: "https://example.supabase.co/",
  SUPABASE_KEY: "secret-key",
};

test("checks the home page, the poster list and the Supabase API", () => {
  const checks = buildChecks(env);
  assert.deepEqual(
    checks.map((c) => c.name),
    ["홈페이지", "공고 목록", "Supabase DB(API)"],
  );
  assert.equal(checks[0].url, "https://www.posterlink.kr/");
  assert.equal(
    checks[2].url,
    "https://example.supabase.co/rest/v1/posters?select=id&limit=1",
  );
});

test("skips the Supabase check when its secrets are missing", () => {
  assert.equal(buildChecks({}).length, 2);
});

test("a slow 200 counts as a failure (2026-11-25: home answered 200 after 20 s while Supabase was down)", () => {
  assert.equal(judge({ status: 200, ms: 1_000 }).ok, true);
  assert.equal(judge({ status: 200, ms: SLOW_MS + 1 }).ok, false);
  assert.equal(judge({ status: 500, ms: 100 }).reason, "HTTP 500");
  assert.equal(judge({ status: 307, ms: 100 }).ok, false);
});

test("retries a failed check once and passes when the retry succeeds", async () => {
  const statuses = [522, 200];
  const summary = await runChecks([{ name: "a", url: "https://a.test/" }], {
    fetchImpl: async () => new Response("", { status: statuses.shift() }),
    sleep: async () => {},
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.results[0].attempts, 2);
});

test("a network error fails without leaking the URL or the key", async () => {
  const summary = await runChecks(buildChecks(env), {
    fetchImpl: async () => {
      throw new TypeError(
        "fetch failed https://example.supabase.co secret-key",
        { cause: { code: "ECONNRESET" } },
      );
    },
    sleep: async () => {},
  });
  assert.equal(summary.ok, false);
  const text = JSON.stringify(summary) + formatMarkdown(summary);
  assert.equal(text.includes("example.supabase.co"), false);
  assert.equal(text.includes("secret-key"), false);
  assert.equal(summary.results[0].reason, "연결 실패 ECONNRESET");
});
