import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignQuery,
  publicAnalyticsPath,
  safeReferrer,
  sanitizedVisitQuery,
} from "./analyticsPrivacy";
import { attachAnalyticsAuthReceipt } from "./analyticsAuthReceipt";
import { NextRequest, NextResponse } from "next/server";

test("approved PosterLink click campaign retains its exact content slug", () => {
  const q = campaignQuery(
    "utm_source=chatgpt&utm_medium=paid&utm_campaign=pl_2611_test&utm_content=public_info_a",
  );
  assert.equal(q.size, 4);
  assert.equal(q.get("utm_content"), "public_info_a");
  assert.equal(campaignQuery("utm_source=chatgpt&utm_source=naver").size, 0);
  for (const value of [
    "public_info_b",
    "public_info_a@example.com",
    "public_info_a_token",
    "public_info_a/secret",
  ]) {
    assert.equal(
      campaignQuery("utm_content=" + encodeURIComponent(value)).size,
      0,
    );
  }
});

test("approved campaign taxonomy retains five UTM fields without arbitrary query data", () => {
  const q = campaignQuery(
    "utm_source=chatgpt&utm_medium=paid&utm_campaign=pl_2611_startup_test&utm_content=startup_ad_a&utm_term=pl_startup&q=test@example.com&access_token=secret",
  );
  assert.equal(q.size, 5);
  assert.equal(q.get("utm_content"), "startup_ad_a");
  assert.ok(!q.toString().includes("secret"));
});
test("PII, unsupported sources, malformed and high entropy/long campaign inputs fail closed", () => {
  for (const input of [
    "utm_source=person@example.com",
    "utm_medium=custom_person",
    "utm_campaign=pl_01012345678",
    "utm_term=kim",
    "utm_campaign=pl_secret_token",
    "utm_content=home-address",
    "utm_campaign=pl_" + "a".repeat(100),
  ])
    assert.equal(campaignQuery(input).size, 0, input);
});
test("query sanitization removes tokens, search text, error messages and nested redirect URLs", () => {
  const text = sanitizedVisitQuery(
    "?q=kim%40example.com&access_token=secret&code=authcode&msg=personal&redirectTo=https://example.com&category=culture&sort=deadline",
  );
  assert.equal(text, "category=culture&sort=deadline");
});

test("own visit logs cannot link campaign parameters to an account", () => {
  const input =
    "utm_source=chatgpt&utm_medium=paid&utm_campaign=pl_2611_test&utm_content=public_info_a&category=culture";
  assert.equal(sanitizedVisitQuery(input), "category=culture");
  assert.equal(campaignQuery(input).get("utm_content"), "public_info_a");
});
test("only structural public page paths are measured, never auth/admin/account or arbitrary path text", () => {
  for (const path of [
    "/auth/callback",
    "/api/auth/naver/callback",
    "/admin/traffic",
    "/operator",
    "/mypage/edit",
    "/posters/test@example.com",
    "/posters/00000000-0000-0000-0000-000000000000?token=secret",
  ])
    assert.equal(publicAnalyticsPath(path), null, path);
  for (const path of [
    "/",
    "/categories/bid",
    "/institutions/mapo-gu-office",
    "/regions/seoul-mapo/course",
    "/posters/00000000-0000-0000-0000-000000000000",
  ])
    assert.equal(publicAnalyticsPath(path), path);
});
test("referrers are origin-only on known public sources", () => {
  assert.equal(
    safeReferrer("https://www.google.com/search?q=email@example.com#secret"),
    "https://google.com/",
  );
  for (const url of [
    "https://email.example.com/private",
    "javascript:alert(1)",
    "https://google.com.evil.test/token",
  ])
    assert.equal(safeReferrer(url), null);
});
test("OAuth success receipt requires explicit consent and contains no account identifiers", () => {
  const req = new NextRequest("https://www.posterlink.kr/auth/callback");
  const res = NextResponse.redirect("https://www.posterlink.kr/");
  attachAnalyticsAuthReceipt(req, res, "kakao");
  assert.equal(res.cookies.get("pl_analytics_auth"), undefined);
  const consentReq = new NextRequest(req, {
    headers: { cookie: "pl_analytics_consent=granted" },
  });
  attachAnalyticsAuthReceipt(consentReq, res, "naver", true);
  const receipt = JSON.parse(
    decodeURIComponent(res.cookies.get("pl_analytics_auth")!.value),
  );
  assert.deepEqual(Object.keys(receipt).sort(), ["at", "method", "signup"]);
  assert.equal(receipt.signup, true);
  assert.equal(receipt.method, "naver");
});
