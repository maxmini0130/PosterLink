import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const id = "11111111-1111-4111-8111-111111111111";
const user = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
  identities: [{ id, user_id: id, provider: "email" }],
};
const token =
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url") +
  ".fixture";
const session = {
  access_token: token,
  refresh_token: "fixture-only-not-real",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
test.beforeEach(async ({ page, context, baseURL }) => {
  test.skip(
    !baseURL?.startsWith("http://localhost:4001"),
    "Local enabled synthetic Auth server only",
  );
  await context.route("https://vercel.live/**", (r) => r.abort());
  await context.route(
    /https:\/\/.*(google-analytics\.com|googletagmanager\.com)\//,
    (r) => r.abort(),
  );
  await context.route("**/api/**", (r) =>
    ["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort(),
  );
  await context.route(url + "/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/auth/v1/user")) return r.fulfill({ json: user });
    if (path.endsWith("/auth/v1/token") || path.endsWith("/auth/v1/signup"))
      return r.fulfill({ json: session });
    if (!["GET", "HEAD"].includes(r.request().method()))
      return r.fulfill({
        status: 403,
        json: { message: "Fixture denies mutations" },
      });
    return r.continue();
  });
  await page.addInitScript(() =>
    localStorage.setItem("pl.analytics.consent.v1", "granted"),
  );
});
const eventNames = () =>
  (window.dataLayer || [])
    .map((x) => Array.from(x as ArrayLike<unknown>))
    .filter((x) => x[0] === "event")
    .map((x) => x[1]);

test("email signup failure emits nothing and successful session emits one signup without role writes", async ({
  page,
  context,
}) => {
  let success = false;
  let profileSaves = 0;
  const emitted: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("__signup_fixture_event__"))
      emitted.push(message.text().slice("__signup_fixture_event__".length));
  });
  await context.route(url + "/auth/v1/signup**", (route) =>
    success
      ? route.fulfill({ json: session })
      : route.fulfill({
          status: 400,
          json: { message: "Fixture signup failure" },
        }),
  );
  await context.route(url + "/rest/v1/profiles**", (route) => {
    if (route.request().method() !== "GET") {
      expect(route.request().postDataJSON()).not.toHaveProperty("role");
      profileSaves++;
    }
    return route.fulfill({ json: [] });
  });
  await context.route("**/onboarding**", (route) => route.abort());
  await page.goto("/signup");
  await expect.poll(() => page.evaluate(eventNames)).toContain("page_view");
  // Capture names outside the document before an intentionally aborted redirect clears its queue.
  await page.evaluate(() => {
    const original = window.gtag!;
    window.gtag = (...args: unknown[]) => {
      original(...args);
      if (args[0] === "event")
        console.debug("__signup_fixture_event__" + String(args[1]));
    };
  });
  await page.locator('input[type="email"]').fill("fixture@example.invalid");
  await page.locator('input[type="password"]').fill("fixture-password");
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "이메일로 가입하기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "이메일로 가입하기", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(eventNames)).not.toContain("sign_up");
  expect(profileSaves).toBe(0);
  success = true;
  await page
    .getByRole("button", { name: "이메일로 가입하기", exact: true })
    .click();
  await expect.poll(() => profileSaves).toBe(1);
  await expect
    .poll(() => emitted.filter((name) => name === "sign_up").length)
    .toBe(1);
  expect(profileSaves).toBe(1);
});

test("institution follow emits only on successful mocked save and removal", async ({
  page,
  context,
  request,
}) => {
  const html = await (await request.get("/institutions")).text();
  // The navigation also contains /institutions/following; it is not a detail.
  const institutionPath = [
    ...html.matchAll(/href="(\/institutions\/[^"/?]+)"/g),
  ]
    .map((match) => match[1])
    .find((path) => path !== "/institutions/following");
  expect(institutionPath).toBeTruthy();
  const response = await request.get(institutionPath!);
  expect(response.status()).toBe(200);
  const anonymousHtml = await response.text();
  // Serve anonymous SSR markup locally; the synthetic session never goes to SSR Auth.
  await context.route("http://localhost:4001" + institutionPath!, (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: anonymousHtml })
      : route.continue(),
  );
  await context.addCookies([
    {
      name: "sb-" + new URL(url).hostname.split(".")[0] + "-auth-token",
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      url: "http://localhost:4001",
    },
  ]);
  let success = false;
  await context.route(url + "/rest/v1/institution_follows**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: null })
      : success
        ? route.fulfill({ status: 200, json: [] })
        : route.fulfill({ status: 403, json: { message: "Fixture failure" } }),
  );
  await page.goto(institutionPath!);
  const follow = page.getByRole("button", { name: "기관 팔로우", exact: true });
  await expect(follow).toBeEnabled();
  await follow.click();
  await expect(follow).toBeEnabled();
  expect(await page.evaluate(eventNames)).not.toContain("follow_institution");
  success = true;
  await follow.click();
  const unfollow = page.getByRole("button", {
    name: "팔로우 취소",
    exact: true,
  });
  await expect(unfollow).toBeVisible();
  await unfollow.click();
  await expect(follow).toBeVisible();
  const names = await page.evaluate(eventNames);
  expect(names.filter((name) => name === "follow_institution")).toHaveLength(1);
  expect(names.filter((name) => name === "unfollow_institution")).toHaveLength(
    1,
  );
});
test("real login handler emits only after successful mocked Auth response", async ({
  page,
  context,
}) => {
  let success = false;
  await context.route(url + "/auth/v1/token**", (r) =>
    success
      ? r.fulfill({ json: session })
      : r.fulfill({
          status: 400,
          json: {
            error: "invalid_grant",
            error_description: "Fixture failure",
          },
        }),
  );
  await page.goto("/login");
  // Wait for the client analytics effect (and hydration), not just SSR form markup.
  await expect.poll(() => page.evaluate(eventNames)).toContain("page_view");
  await page.locator("input[type=email]").fill("fixture@example.invalid");
  await page.locator("input[type=password]").fill("fixture-password");
  await page
    .getByRole("button", { name: "이메일로 로그인", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "이메일로 로그인", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(eventNames)).not.toContain("login");
  success = true;
  await page
    .getByRole("button", { name: "이메일로 로그인", exact: true })
    .click();
  await expect.poll(() => page.evaluate(eventNames)).toContain("login");
  expect(
    (await page.evaluate(eventNames)).filter((x) => x === "login"),
  ).toHaveLength(1);
});
test("real favorite handler suppresses failure and emits save/unsave only after mocked DB success", async ({
  page,
  context,
  request,
}) => {
  const html = await (await request.get("/posters")).text();
  const paths = [
    ...new Set(
      [...html.matchAll(/href="(\/posters\/[0-9a-f-]{36})"/g)].map((x) => x[1]),
    ),
  ];
  let posterPath = "";
  for (const candidate of paths) {
    if ((await request.get(candidate)).status() === 200) {
      posterPath = candidate;
      break;
    }
  }
  expect(posterPath).not.toBe("");
  const key = "sb-" + new URL(url).hostname.split(".")[0] + "-auth-token";

  // Anonymous SSR: synthetic credentials never reach the real server.

  let success = false;
  await context.route(url + "/rest/v1/favorites**", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ json: null })
      : success
        ? r.fulfill({
            status: 201,
            json: [{ poster_id: posterPath.split("/")[2] }],
          })
        : r.fulfill({
            status: 403,
            json: { message: "Fixture write failure" },
          }),
  );
  await page.goto(posterPath);
  const actions = page.getByRole("group", { name: "공고 상세 동작" });
  await expect(actions).toBeVisible();
  await page.waitForLoadState("networkidle");
  await context.addCookies([
    {
      name: key,
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      url: "http://localhost:4001",
    },
  ]);
  await actions.getByRole("button", { name: "찜하기", exact: true }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(eventNames)).not.toContain("save_poster");
  success = true;
  await actions.getByRole("button", { name: "찜하기", exact: true }).click();
  await expect.poll(() => page.evaluate(eventNames)).toContain("save_poster");
  await actions.getByRole("button", { name: "찜 취소", exact: true }).click();
  await expect.poll(() => page.evaluate(eventNames)).toContain("unsave_poster");
});
test("actual SPA listener measures navigation once and consent UI supports withdrawal", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(
    page.getByRole("button", { name: "분석에 동의", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(eventNames)).toContain("page_view");
  await page.locator('header a[href="/"]').first().click();
  await expect(page).toHaveURL("http://localhost:4001/");
  await expect
    .poll(
      async () =>
        (await page.evaluate(eventNames)).filter((x) => x === "page_view")
          .length,
    )
    .toBe(2);
  await page.goto("/privacy");
  await page
    .getByRole("button", { name: "동의하지 않음 / 철회", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("pl.analytics.consent.v1")),
  ).toBe("denied");
});

test("withdrawal updates the SDK and consent UI in another already open tab", async ({
  page,
  context,
}) => {
  await page.goto("/privacy");
  const second = await context.newPage();
  await second.goto("/privacy");
  const settings = second.locator("section[aria-label]");
  await expect(settings.getByRole("status")).toHaveText("현재 상태: 동의");
  await page
    .getByRole("button", { name: "동의하지 않음 / 철회", exact: true })
    .click();
  await expect(settings.getByRole("status")).toHaveText(
    "현재 상태: 동의하지 않음",
  );
  expect(
    await second.evaluate(
      () =>
        (window as unknown as Record<string, unknown>)[
          "ga-disable-G-TESTFIXTURE"
        ],
    ),
  ).toBe(true);
  await second.close();
});

test("existing comment create and delete handlers retain behavior with mocked writes only", async ({
  page,
  context,
  request,
}) => {
  const listing = await (await request.get("/posters")).text();
  const paths = [...listing.matchAll(/href="(\/posters\/[0-9a-f-]{36})"/g)].map(
    (m) => m[1],
  );
  let posterPath = "";
  let html = "";
  for (const path of [...new Set(paths)]) {
    const r = await request.get(path);
    if (r.ok()) {
      posterPath = path;
      html = await r.text();
      break;
    }
  }
  expect(posterPath).not.toBe("");
  await context.route("**" + posterPath, (r) =>
    r.request().resourceType() === "document"
      ? r.fulfill({ body: html, contentType: "text/html" })
      : r.continue(),
  );
  const key = "sb-" + new URL(url).hostname.split(".")[0] + "-auth-token";
  await context.addCookies([
    {
      name: key,
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      url: "http://localhost:4001",
    },
  ]);
  const body = "Local fixture comment — never saved";
  let rows: Array<Record<string, unknown>> = [];
  const writes: string[] = [];
  await context.route(url + "/rest/v1/profiles**", (r) =>
    r.fulfill({ json: [{ id, nickname: "Fixture author" }] }),
  );
  await context.route(url + "/rest/v1/comments**", (r) => {
    const method = r.request().method();
    if (method === "POST") {
      writes.push(method);
      rows = [
        {
          id: "44444444-4444-4444-8444-444444444444",
          user_id: id,
          poster_id: posterPath.split("/")[2],
          body,
          comment_type: "question",
          status: "normal",
          created_at: new Date().toISOString(),
        },
      ];
    } else if (method === "PATCH") {
      writes.push(method);
      rows = [];
    }
    return r.fulfill({ status: 200, json: method === "GET" ? rows : [] });
  });
  await page.goto(posterPath);
  const input = page.getByPlaceholder(
    "공고에 대해 궁금한 점을 질문으로 남겨주세요.",
  );
  await expect(input).toBeEnabled();
  await input.fill(body);
  await page.locator("form").filter({ has: input }).getByRole("button").click();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await page
    .locator(".group")
    .filter({ has: page.getByText(body, { exact: true }) })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByText(body, { exact: true })).toHaveCount(0);
  expect(writes).toEqual(["POST", "PATCH"]);
});
