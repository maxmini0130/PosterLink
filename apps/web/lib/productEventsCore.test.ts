import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNUP_INTENT_TTL_MS,
  detectClient,
  fallbackSignupIntent,
  pageTypeFromPath,
  parsePathHistory,
  parseSignupIntent,
  posterIdFromHref,
  previousPathFor,
  pushPathHistory,
  resolvePosterViewSource,
  sanitizeMetadata,
  shareUrl,
} from "./productEventsCore";

const ORIGIN = "https://www.posterlink.kr";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const NOW = 1_800_000_000_000;

test("page type comes from the public route", () => {
  assert.equal(pageTypeFromPath("/"), "home");
  assert.equal(pageTypeFromPath("/posters"), "list");
  assert.equal(pageTypeFromPath(`/posters/${ID}`), "detail");
  assert.equal(pageTypeFromPath("/posters/request"), "other");
  assert.equal(pageTypeFromPath("/regions/seoul/mapo"), "region");
  assert.equal(pageTypeFromPath("/institutions/abc"), "institution");
  assert.equal(pageTypeFromPath("/favorites"), "favorites");
});

test("metadata keeps only RPC-allowed keys and safe values", () => {
  assert.deepEqual(
    sanitizeMetadata({
      screen: "detail",
      feature: "favorite",
      logged_in: false,
      category_count: 2,
      channel: "link copy", // spaces are rejected
      status: "x".repeat(65),
      // @ts-expect-error unknown keys are dropped at runtime too
      email: "a@b.c",
    }),
    {
      screen: "detail",
      feature: "favorite",
      logged_in: false,
      category_count: 2,
    },
  );
});

test("app WebView is detected by the user agent suffix", () => {
  assert.equal(detectClient("Mozilla/5.0 ... PosterLinkApp/1.2.0"), "app");
  assert.equal(detectClient("Mozilla/5.0 Safari"), "web");
});

test("signup intent expires and rejects unknown values", () => {
  const intent = JSON.stringify({
    screen: "institution",
    feature: "follow",
    at: NOW,
  });
  assert.deepEqual(parseSignupIntent(intent, NOW + 1000), {
    screen: "institution",
    feature: "follow",
    at: NOW,
  });
  assert.equal(parseSignupIntent(intent, NOW + SIGNUP_INTENT_TTL_MS + 1), null);
  assert.equal(
    parseSignupIntent(
      JSON.stringify({ screen: "x", feature: "follow", at: NOW }),
      NOW,
    ),
    null,
  );
  assert.equal(parseSignupIntent("not json", NOW), null);
});

test("fallback signup origin uses a same-origin referrer page only", () => {
  assert.equal(
    fallbackSignupIntent("login", `${ORIGIN}/posters/${ID}`, ORIGIN, NOW)
      .screen,
    "detail",
  );
  assert.equal(
    fallbackSignupIntent("login", "https://search.naver.com/", ORIGIN, NOW)
      .screen,
    "login",
  );
  assert.equal(
    fallbackSignupIntent("signup", `${ORIGIN}/login`, ORIGIN, NOW).screen,
    "signup",
  );
  assert.equal(
    fallbackSignupIntent("login", "", ORIGIN, NOW).feature,
    "direct",
  );
});

test("poster id is read only from same-origin detail links", () => {
  assert.equal(posterIdFromHref(`/posters/${ID}`, ORIGIN), ID);
  assert.equal(
    posterIdFromHref(`https://evil.example/posters/${ID}`, ORIGIN),
    null,
  );
  assert.equal(posterIdFromHref("/posters", ORIGIN), null);
});

test("path history is independent of effect order", () => {
  const listed = pushPathHistory(parsePathHistory(null), "/posters");
  // layout recorded the detail path first
  const recorded = pushPathHistory(listed, `/posters/${ID}`);
  assert.equal(previousPathFor(recorded, `/posters/${ID}`), "/posters");
  // detail read before the layout recorded it
  assert.equal(previousPathFor(listed, `/posters/${ID}`), "/posters");
  // re-render of the same path does not overwrite history
  assert.deepEqual(pushPathHistory(recorded, `/posters/${ID}`), recorded);
  assert.deepEqual(parsePathHistory('{"current":"https://x"}'), {
    current: null,
    previous: null,
  });
});

test("poster view source priority: card click, share link, in-app path, referrer", () => {
  const base = {
    posterId: ID,
    navSource: null,
    search: "",
    currentPath: `/posters/${ID}`,
    previousPath: null,
    referrer: "",
    origin: ORIGIN,
    now: NOW,
  };
  assert.equal(
    resolvePosterViewSource({
      ...base,
      navSource: { posterId: ID, source: "home", at: NOW - 500 },
      previousPath: "/posters",
    }),
    "home",
  );
  // stale or different-poster card clicks are ignored
  assert.equal(
    resolvePosterViewSource({
      ...base,
      navSource: { posterId: ID, source: "home", at: NOW - 120_000 },
    }),
    "direct",
  );
  assert.equal(
    resolvePosterViewSource({ ...base, search: "?utm_campaign=pl_share" }),
    "share",
  );
  assert.equal(
    resolvePosterViewSource({ ...base, previousPath: "/posters" }),
    "search",
  );
  assert.equal(
    resolvePosterViewSource({
      ...base,
      previousPath: "/posters/11111111-2222-4333-8444-555555555555",
    }),
    "related",
  );
  // a reload keeps the same path, so the full-load referrer decides
  assert.equal(
    resolvePosterViewSource({
      ...base,
      previousPath: base.currentPath,
      referrer: "https://m.search.naver.com/",
    }),
    "external",
  );
  assert.equal(
    resolvePosterViewSource({
      ...base,
      referrer: `${ORIGIN}/institutions/abc`,
    }),
    "institution",
  );
  assert.equal(resolvePosterViewSource(base), "direct");
});

test("share URL drops query and hash and adds only the share campaign", () => {
  assert.equal(
    shareUrl(
      `${ORIGIN}/posters/${ID}?notification_open=1&utm_source=google#comments`,
    ),
    `${ORIGIN}/posters/${ID}?utm_campaign=pl_share`,
  );
});
