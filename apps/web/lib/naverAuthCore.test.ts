import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeTxCookie,
  isRecentSignIn,
  lastSignInAt,
  naverEnabled,
  naverIdHashes,
  newSecret,
  parseHashKeys,
  parseTxCookie,
  sameOrigin,
  sha256Hex,
  validNaverId,
} from "./naverAuthCore";

const K1 = "k".repeat(32);
const K2 = "m".repeat(40);

test("only NAVER_LOGIN_ENABLED=true turns the routes on", () => {
  assert.equal(naverEnabled({ NAVER_LOGIN_ENABLED: "true" }), true);
  for (const value of [undefined, "", "1", "TRUE", "yes", "false"])
    assert.equal(naverEnabled({ NAVER_LOGIN_ENABLED: value }), false);
});

test("hash keys are read by version and a short key is an error", () => {
  assert.deepEqual(parseHashKeys({}), []);
  assert.deepEqual(
    parseHashKeys({ NAVER_ID_HASH_KEY_V2: K2, NAVER_ID_HASH_KEY_V1: K1 }),
    [
      { version: 1, key: K1 },
      { version: 2, key: K2 },
    ],
  );
  assert.throws(
    () => parseHashKeys({ NAVER_ID_HASH_KEY_V1: "short" }),
    /too short/,
  );
});

test("Naver ID hashes differ per key, are stable, and never contain the id", () => {
  const keys = parseHashKeys({
    NAVER_ID_HASH_KEY_V1: K1,
    NAVER_ID_HASH_KEY_V2: K2,
  });
  const a = naverIdHashes("abc123", keys);
  assert.deepEqual(Object.keys(a), ["1", "2"]);
  assert.match(a["1"], /^[0-9a-f]{64}$/);
  assert.notEqual(a["1"], a["2"]);
  assert.deepEqual(naverIdHashes("abc123", keys), a);
  assert.notEqual(naverIdHashes("abc124", keys)["1"], a["1"]);
  assert.ok(!JSON.stringify(a).includes("abc123"));
  assert.throws(() => naverIdHashes("", keys));
});

test("transaction cookies round-trip and malformed values are rejected", () => {
  const id = "0f0e0d0c-0b0a-4908-8706-050403020100";
  const secret = newSecret();
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(parseTxCookie(encodeTxCookie(id, secret)), { id, secret });
  for (const bad of [
    null,
    "",
    "x",
    `${id}`,
    `${id}.short`,
    `not-a-uuid.${secret}`,
    `${id}.${secret}!`,
  ])
    assert.equal(parseTxCookie(bad), null, String(bad));
  assert.equal(sha256Hex("a").length, 64);
});

test("recent sign-in comes from the amr timestamps, within 10 minutes", () => {
  const now = Date.UTC(2026, 10, 1, 12, 0);
  const sec = (ms: number) => Math.floor(ms / 1000);
  const claims = {
    amr: [
      { method: "oauth", timestamp: sec(now - 60 * 60 * 1000) },
      { method: "otp", timestamp: sec(now - 2 * 60 * 1000) },
    ],
  };
  const at = lastSignInAt(claims);
  assert.equal(at, sec(now - 2 * 60 * 1000) * 1000);
  assert.equal(isRecentSignIn(at, now), true);
  assert.equal(isRecentSignIn(now - 11 * 60 * 1000, now), false);
  assert.equal(isRecentSignIn(now + 5 * 60 * 1000, now), false); // clock far ahead
  assert.equal(isRecentSignIn(null, now), false);
  for (const bad of [null, {}, { amr: "x" }, { amr: [{ timestamp: "1" }] }])
    assert.equal(lastSignInAt(bad), null);
});

test("Naver ids and request origins are checked", () => {
  assert.equal(validNaverId("AbC_-123"), true);
  for (const bad of ["", " ", "a b", "x".repeat(129), 12, null])
    assert.equal(validNaverId(bad), false);
  const headers = (h: Record<string, string>) => ({
    get: (n: string) => h[n] ?? null,
  });
  const site = "https://www.posterlink.kr";
  assert.equal(sameOrigin(headers({ origin: site }), site), true);
  assert.equal(
    sameOrigin(headers({ referer: `${site}/mypage/edit` }), site),
    true,
  );
  assert.equal(
    sameOrigin(headers({ origin: "https://evil.example" }), site),
    false,
  );
  assert.equal(sameOrigin(headers({ origin: "null" }), site), false);
  assert.equal(sameOrigin(headers({}), site), false);
});
