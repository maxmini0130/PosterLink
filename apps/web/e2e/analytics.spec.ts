import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import type * as Harness from "../lib/analytics";

declare global {
  interface Window {
    analyticsFixture: typeof Harness;
  }
}
// Test-only identifier. The Google SDK is blocked; no real property or collection request exists.
const requireRoot = createRequire(
  path.resolve(__dirname, "../../../package.json"),
);
const { buildSync } = requireRoot("esbuild");
const makeFixture = (debug: boolean) =>
  buildSync({
    entryPoints: [path.resolve(__dirname, "../lib/analytics.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "analyticsFixture",
    define: {
      "process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID":
        JSON.stringify("G-TESTFIXTURE"),
      "process.env.NEXT_PUBLIC_GA_ENABLED": '"true"',
      "process.env.NEXT_PUBLIC_GA_POLICY_REVIEWED": '"true"',
      "process.env.NEXT_PUBLIC_VERCEL_ENV": '"preview"',
      "process.env.NEXT_PUBLIC_GA_ALLOW_NON_PRODUCTION": '"true"',
      "process.env.NEXT_PUBLIC_GA_DEBUG": JSON.stringify(String(debug)),
    },
  }).outputFiles[0].text;
const fixture = makeFixture(false);
async function events(page: Page) {
  return page.evaluate(() =>
    (window.dataLayer || [])
      .map((x) => Array.from(x as ArrayLike<unknown>))
      .filter((x) => x[0] === "event"),
  );
}
async function install(page: Page, query = "") {
  await page.goto("/" + query);
  await page.addScriptTag({ content: fixture });
}
test("all twelve event contracts are consent gated and withdrawal stops every event", async ({
  page,
}) => {
  await install(page);
  const result = await page.evaluate(() => {
    const names = [
      "page_view",
      "view_poster",
      "sign_up",
      "login",
      "save_poster",
      "unsave_poster",
      "follow_institution",
      "unfollow_institution",
      "enable_notification",
      "click_application",
      "search_poster",
      "filter_poster",
    ] as const;
    const a = window.analyticsFixture;
    const before = names.map((name) => a.trackAnalytics(name));
    a.setAnalyticsConsent(true);
    const consented = names.map((name) =>
      a.trackAnalytics(name, {
        email: "private@example.invalid",
        access_token: "secret",
        user_id: "secret",
        method: "email",
      }),
    );
    a.setAnalyticsConsent(false);
    const after = names.map((name) => a.trackAnalytics(name));
    return { before, consented, after };
  });
  expect(result.before).toEqual(Array(12).fill(false));
  expect(result.consented).toEqual(Array(12).fill(true));
  expect(result.after).toEqual(Array(12).fill(false));
  const measured = await events(page);
  expect(measured).toHaveLength(12);
  expect(new Set(measured.map((event) => event[1])).size).toBe(12);
  expect(JSON.stringify(measured)).not.toMatch(
    /private@example|secret|user_id|access_token/,
  );
});
test.beforeEach(async ({ context }) => {
  await context.route("**/api/**", (r) =>
    ["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort(),
  );
  await context.route("https://vercel.live/**", (r) => r.abort());
  await context.route(
    /https:\/\/.*(google-analytics\.com|googletagmanager\.com)\//,
    (r) => r.abort(),
  );
});
test("default deployment remains unconfigured without a measurement ID or policy approval", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(page.locator("#posterlink-ga4")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "분석에 동의", exact: true }),
  ).toHaveCount(0);
});
test("consent gates initial and SPA page views, dedupes rerenders and ignores token/search query changes", async ({
  page,
}) => {
  await install(
    page,
    "?utm_source=chatgpt&utm_medium=paid&utm_campaign=pl_2611_startup_test&utm_content=startup_ad_a&access_token=private&q=person@example.com",
  );
  await page.evaluate(() => window.analyticsFixture.trackPageView());
  expect(await events(page)).toHaveLength(0);
  await page.evaluate(() => {
    window.analyticsFixture.setAnalyticsConsent(true);
    window.analyticsFixture.trackPageView();
    window.analyticsFixture.trackPageView();
  });
  expect(await events(page)).toHaveLength(1);
  await page.evaluate(() => {
    history.pushState({}, "", "/categories/bid?access_token=private");
    window.analyticsFixture.trackPageView();
    history.replaceState({}, "", "/categories/bid?q=secret");
    window.analyticsFixture.trackPageView();
  });
  expect(await events(page)).toHaveLength(2);
  const data = JSON.stringify(await events(page));
  expect(data).not.toContain("private");
  expect(data).not.toContain("person@example.com");
  expect(data).not.toContain("secret");
  expect(data).toContain("startup_ad_a");
});
test("detail view once per navigation and strict parameter allowlist", async ({
  page,
}) => {
  await install(page);
  await page.evaluate(() => {
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    history.pushState({}, "", "/posters/00000000-0000-0000-0000-000000000000");
    const heading = document.createElement("h1");
    heading.dataset.analyticsPosterId = "00000000-0000-0000-0000-000000000000";
    document.body.appendChild(heading);
    a.trackPageView();
    a.trackPageView();
    a.trackAnalytics("save_poster", {
      poster_id: "00000000-0000-0000-0000-000000000000",
      email: "private@example.com",
      institution_id: "private@example.com",
      access_token: "secret",
    });
  });
  const data = await events(page);
  expect(data.map((x) => x[1])).toEqual([
    "page_view",
    "view_poster",
    "save_poster",
  ]);
  expect(JSON.stringify(data)).not.toContain("private");
  expect(JSON.stringify(data)).not.toContain("secret");
});

test("missing or private detail does not become a poster-view conversion", async ({
  page,
}) => {
  await install(page);
  await page.evaluate(() => {
    window.analyticsFixture.setAnalyticsConsent(true);
    history.pushState({}, "", "/posters/00000000-0000-0000-0000-000000000000");
    window.analyticsFixture.trackPageView();
  });
  expect(await events(page)).toEqual([]);
});
test("first and session attribution are distinct and internal UTM cannot replace session acquisition", async ({
  page,
}) => {
  await install(
    page,
    "?utm_source=chatgpt&utm_medium=paid&utm_campaign=pl_first",
  );
  await page.evaluate(() => {
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    a.trackPageView();
    history.pushState(
      {},
      "",
      "/categories/bid?utm_source=naver&utm_medium=cpc&utm_campaign=pl_second",
    );
    a.trackPageView();
  });
  let data = await events(page);
  expect(data[1][2]).toMatchObject({
    first_source: "chatgpt",
    session_source: "chatgpt",
  });
  await page.evaluate(() => {
    // Define the next synthetic arrival atomically with expiry; App Router may
    // restore its own URL between the separate fixture evaluations above.
    history.replaceState(
      {},
      "",
      "/categories/bid?utm_source=naver&utm_medium=cpc&utm_campaign=pl_second",
    );
    const value = JSON.parse(
      sessionStorage.getItem("pl.analytics.session.v1")!,
    );
    value.at = Date.now() - 31 * 60 * 1000;
    sessionStorage.setItem("pl.analytics.session.v1", JSON.stringify(value));
    window.analyticsFixture.trackAnalytics("search_poster");
  });
  data = await events(page);
  expect(data[2][2]).toMatchObject({
    first_source: "chatgpt",
    session_source: "naver",
  });
});
test("successful OAuth receipt consumes once, malformed/expired receipts and restored sessions emit nothing", async ({
  page,
}) => {
  await install(page);
  await page.evaluate(() => {
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    a.setAnalyticsLoginStatus(true);
    a.consumeAuthReceipt();
  });
  expect(await events(page)).toHaveLength(0);
  await page.evaluate(() => {
    document.cookie =
      "pl_analytics_auth=" +
      encodeURIComponent(
        JSON.stringify({ method: "naver", signup: true, at: Date.now() }),
      ) +
      "; Path=/";
    window.analyticsFixture.consumeAuthReceipt();
    window.analyticsFixture.consumeAuthReceipt();
    window.analyticsFixture.setAnalyticsLoginStatus(true);
  });
  expect((await events(page)).map((x) => x[1])).toEqual(["sign_up", "login"]);
  await page.evaluate(() => {
    document.cookie =
      "pl_analytics_auth=" +
      encodeURIComponent(JSON.stringify({ method: "kakao", at: 0 })) +
      "; Path=/";
    window.analyticsFixture.consumeAuthReceipt();
  });
  expect(await events(page)).toHaveLength(2);
});
test("withdrawal stops subsequent events and clears attribution; storage/transport failures do not throw", async ({
  page,
}) => {
  await install(page);
  await page.evaluate(() => {
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    a.trackPageView();
    a.setAnalyticsConsent(false);
    a.trackAnalytics("login", { method: "email" });
  });
  expect(await events(page)).toHaveLength(1);
  expect(
    await page.evaluate(() => localStorage.getItem("pl.analytics.first.v1")),
  ).toBeNull();
  await page.evaluate(() => {
    window.analyticsFixture.setAnalyticsConsent(true);
    window.gtag = () => {
      throw Error("SDK failure");
    };
    window.analyticsFixture.trackAnalytics("login");
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("blocked storage");
      },
    });
    window.analyticsFixture.trackPageView();
  });
});
test("existing Google tag and excluded admin/auth routes never receive additional events", async ({
  page,
}) => {
  await install(page);
  await page.evaluate(() => {
    window.gtag = () => {};
    window.analyticsFixture.setAnalyticsConsent(true);
    window.analyticsFixture.trackPageView();
  });
  expect(await events(page)).toHaveLength(0);
  await expect(page.locator("#posterlink-ga4")).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/auth/callback?access_token=private");
    window.analyticsFixture.trackPageView();
    window.analyticsFixture.trackAnalytics("login");
  });
  expect(await events(page)).toHaveLength(0);
});

test("withdrawal disables the SDK before a failing consent call and still clears all stores", async ({
  page,
}) => {
  await install(page);
  const result = await page.evaluate(() => {
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    a.trackPageView();
    document.cookie = "_ga=fixture; Path=/";
    document.cookie = "pl_analytics_auth=fixture; Path=/";
    let disabledInsideSdk = false;
    window.gtag = () => {
      disabledInsideSdk =
        (window as unknown as Record<string, unknown>)[
          "ga-disable-G-TESTFIXTURE"
        ] === true;
      throw Error("SDK consent failure");
    };
    a.setAnalyticsConsent(false);
    return {
      disabledInsideSdk,
      consent: localStorage.getItem(a.CONSENT_KEY),
      first: localStorage.getItem("pl.analytics.first.v1"),
      session: sessionStorage.getItem("pl.analytics.session.v1"),
      cookies: document.cookie,
    };
  });
  expect(result).toMatchObject({
    disabledInsideSdk: true,
    consent: "denied",
    first: null,
    session: null,
  });
  expect(result.cookies).not.toContain("_ga=");
  expect(result.cookies).not.toContain("pl_analytics_auth=");
});

test("another open tab stops measurement immediately when consent is withdrawn", async ({
  page,
  context,
}) => {
  await install(page);
  await page.evaluate(() => {
    window.analyticsFixture.setAnalyticsConsent(true);
    window.analyticsFixture.trackPageView();
  });
  const second = await context.newPage();
  await install(second);
  await second.evaluate(() => {
    window.addEventListener(
      "storage",
      window.analyticsFixture.syncAnalyticsConsentFromStorage,
    );
    window.analyticsFixture.trackPageView();
  });
  expect(await events(second)).toHaveLength(1);
  await page.evaluate(() => window.analyticsFixture.setAnalyticsConsent(false));
  await expect
    .poll(() =>
      second.evaluate(
        () =>
          (window as unknown as Record<string, unknown>)[
            "ga-disable-G-TESTFIXTURE"
          ],
      ),
    )
    .toBe(true);
  await second.evaluate(() =>
    window.analyticsFixture.trackAnalytics("login", { method: "email" }),
  );
  expect(await events(second)).toHaveLength(1);
  expect(
    await second.evaluate(() =>
      sessionStorage.getItem("pl.analytics.session.v1"),
    ),
  ).toBeNull();
  await second.close();
});

test("delayed SDK transports recheck consent while started requests and unrelated traffic remain intact", async ({
  page,
}) => {
  await install(page);
  const result = await page.evaluate(async () => {
    const calls: string[] = [];
    let finish: () => void = () => {};
    window.fetch = (input) => {
      if (String(input) === "/api/site-visits") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      calls.push(String(input));
      return new Promise<Response>((resolve) => {
        finish = () => resolve(new Response(null, { status: 204 }));
      });
    };
    navigator.sendBeacon = (url) => {
      if (String(url) === "/api/site-visits") return true;
      calls.push(String(url));
      return true;
    };
    XMLHttpRequest.prototype.open = function () {};
    XMLHttpRequest.prototype.send = function () {
      calls.push("xhr");
    };
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    a.trackPageView();
    const hit =
      "https://region1.google-analytics.com/g/collect?tid=G-TESTFIXTURE";
    const started = fetch(hit);
    const scheduled = new Promise<void>((resolve) =>
      setTimeout(async () => {
        await fetch(hit);
        navigator.sendBeacon(hit, "en=page_view");
        const xhr = new XMLHttpRequest();
        xhr.open("POST", hit);
        xhr.send("en=page_view");
        resolve();
      }, 20),
    );
    a.setAnalyticsConsent(false);
    finish();
    await started;
    await scheduled;
    navigator.sendBeacon("/api/unrelated", "normal request");
    navigator.sendBeacon(
      "https://www.google-analytics.com/g/collect?tid=G-OTHER",
      "other tag",
    );
    a.setAnalyticsConsent(true);
    navigator.sendBeacon(hit, "en=page_view");
    return { calls, consent: localStorage.getItem(a.CONSENT_KEY) };
  });
  expect(result.calls).toEqual([
    "https://region1.google-analytics.com/g/collect?tid=G-TESTFIXTURE",
    "/api/unrelated",
    "https://www.google-analytics.com/g/collect?tid=G-OTHER",
    "https://region1.google-analytics.com/g/collect?tid=G-TESTFIXTURE",
  ]);
  expect(result.consent).toBe("granted");
});

test("withdrawal blocks queued hits even if consent storage cannot be updated", async ({
  page,
}) => {
  await install(page);
  const count = await page.evaluate(async () => {
    let sent = 0;
    navigator.sendBeacon = () => {
      sent++;
      return true;
    };
    const a = window.analyticsFixture;
    a.setAnalyticsConsent(true);
    a.trackPageView();
    Storage.prototype.setItem = () => {
      throw Error("blocked write");
    };
    a.setAnalyticsConsent(false);
    navigator.sendBeacon(
      "https://www.google-analytics.com/g/collect?tid=G-TESTFIXTURE",
    );
    return sent;
  });
  expect(count).toBe(0);
});

for (const debug of [false, true]) {
  test(`event debug flag is omitted unless explicitly enabled (${debug})`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.addScriptTag({ content: makeFixture(debug) });
    const commands = await page.evaluate(() => {
      window.analyticsFixture.setAnalyticsConsent(true);
      window.analyticsFixture.trackPageView();
      return window.dataLayer?.map((x) => Array.from(x as ArrayLike<unknown>));
    });
    const config = commands?.find((x) => x[0] === "config")?.[2];
    const event = commands?.find((x) => x[0] === "event")?.[2];
    expect(config).toMatchObject({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    expect(config).not.toHaveProperty("debug_mode");
    if (debug) expect(event).toHaveProperty("debug_mode", true);
    else expect(event).not.toHaveProperty("debug_mode");
  });
}
