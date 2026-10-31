import { test, expect } from "@playwright/test";

function cookie(role: string) {
  const token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
        fixture_role: role,
      }),
    ).toString("base64url"),
    "fixture",
  ].join(".");
  return (
    "sb-127-auth-token=base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: token,
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url")
  );
}

test("anonymous endpoint is private and never exposes Auth data", async ({
  request,
}) => {
  const response = await request.get("/api/admin/signup-stats");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ error: "Unauthorized" });
});

test("actual server route verifies roles, pages Auth and fails closed", async ({
  request,
  baseURL,
}) => {
  test.skip(
    baseURL !== "http://localhost:4002",
    "Positive API validation uses only the isolated local fixture",
  );
  const control = (scenario: string) =>
    request.post(`http://127.0.0.1:4010/control?scenario=${scenario}`);
  await control("normal");
  for (const role of ["user", "admin"]) {
    const denied = await request.get("/api/admin/signup-stats", {
      headers: { Cookie: cookie(role) },
    });
    expect(denied.status()).toBe(403);
  }
  expect(
    (await (await request.get("http://127.0.0.1:4010/control")).json()).reads,
  ).toBe(0);
  const headers = { Cookie: cookie("super_admin") };
  const success = await request.get("/api/admin/signup-stats", { headers });
  expect(success.status()).toBe(200);
  expect((await success.json()).totalAccounts).toBe(4);
  expect(await success.text()).not.toMatch(
    /fixture-account|never-return-this|user_metadata|local-fixture-service/,
  );
  await control("pages");
  const paginated = await request.get("/api/admin/signup-stats", { headers });
  expect(paginated.status()).toBe(200);
  expect((await paginated.json()).totalAccounts).toBe(10001);
  expect(
    (await (await request.get("http://127.0.0.1:4010/control")).json()).reads,
  ).toBe(12);
  for (const scenario of ["failure", "incomplete", "missing-total"]) {
    await control(scenario);
    const response = await request.get("/api/admin/signup-stats", { headers });
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({
      error: "Signup statistics unavailable",
    });
  }
});

test("admin UI shows aggregate and limitations on desktop and mobile", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(
    baseURL !== "http://localhost:4002",
    "Preview admin middleware requires a real account; never bypass application authorization",
  );
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.invalid",
    app_metadata: {},
    user_metadata: {},
  };
  const token = cookie("super_admin").split("base64-")[1];
  // Seed a synthetic browser session; outgoing Auth/DB/API traffic is intercepted.
  await context.addCookies([
    { name: "sb-127-auth-token", value: "base64-" + token, url: baseURL! },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("pl.analytics.consent.v1", "denied");
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/auth/v1/"))
      return route.fulfill({ json: user });
    if (url.pathname.startsWith("/rest/v1/"))
      return route.fulfill({
        json: url.pathname.endsWith("/profiles") ? { role: "super_admin" } : [],
        headers: { "content-range": "0-0/0" },
      });
    if (url.pathname === "/api/admin/signup-stats")
      return route.fulfill({
        json: {
          totalAccounts: 12,
          today: 1,
          thisWeek: 3,
          thisMonth: 7,
          asOf: "2026-10-23T00:00:00Z",
          daily: [{ date: "2026-10-23", count: 1 }],
        },
      });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
    if (url.origin !== new URL(baseURL!).origin) return route.abort();
    return route.continue();
  });
  // Production Supabase storage keys differ; browser Auth requests are mocked,
  // but getUser needs a locally available session before making that request.
  await page.addInitScript(
    (value) => {
      for (const key of [
        "sb-127-auth-token",
        "sb-" + new URL(value.url).hostname.split(".")[0] + "-auth-token",
      ]) {
        localStorage.setItem(
          key,
          atob(value.session.replace(/-/g, "+").replace(/_/g, "/")),
        );
      }
    },
    {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:4010",
      session: token,
    },
  );
  await page.goto("/admin");
  const panel = page.getByRole("region", { name: "Auth 신규 계정 집계" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("오늘 생성", { exact: true })).toBeVisible();
  await expect(panel).toContainText(
    "탈퇴 전 과거 가입 총량은 복원할 수 없습니다",
  );
  const artifact = process.env.E2E_BASE_URL ? "preview" : "local";
  await page.screenshot({
    path: `../../data/results/signup-stats-20261023/${artifact}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../../data/results/signup-stats-20261023/${artifact}-mobile.png`,
    fullPage: true,
  });
});

test("anonymous admin remains guarded and signup/login screens are unchanged", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  const guarded = await request.get("/admin", { maxRedirects: 0 });
  expect([302, 307]).toContain(guarded.status());
  expect(guarded.headers().location).toContain("/login");
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL!).origin) return route.abort();
    if (
      url.pathname.startsWith("/api/") &&
      !["GET", "HEAD"].includes(route.request().method())
    )
      return route.abort();
    return route.continue();
  });
  await page.goto("/login");
  for (const label of [
    "카카오로 시작하기",
    "구글로 시작하기",
    "네이버로 시작하기",
  ])
    await expect(
      page.getByRole("button", { name: new RegExp(label) }),
    ).toBeVisible();
  await page.goto("/signup");
  await expect(page.locator("input[type=email]")).toBeVisible();
  await expect(page.locator("input[type=password]")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이메일로 가입하기", exact: true }),
  ).toBeDisabled();
});

test("actual email signup failure adds nothing; success and retry count one Auth ID", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.skip(
    baseURL !== "http://localhost:4002",
    "Isolated local Auth fixture only",
  );
  await context.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await context.route("https://**", (route) => route.abort());
  const read = async () =>
    (
      await (
        await request.get("/api/admin/signup-stats", {
          headers: { Cookie: cookie("super_admin") },
        })
      ).json()
    ).totalAccounts;
  const submit = async () => {
    await page.goto("/signup");
    await page.locator("input[type=email]").fill("fixture@example.invalid");
    await page.locator("input[type=password]").fill("fixture-password");
    await page.locator("input[type=checkbox]").check();
    await page
      .getByRole("button", { name: "이메일로 가입하기", exact: true })
      .click();
  };
  await request.post("http://127.0.0.1:4010/control?scenario=signup-failure");
  expect(await read()).toBe(4);
  await submit();
  await expect(
    page.getByRole("button", { name: "이메일로 가입하기", exact: true }),
  ).toBeEnabled();
  expect(await read()).toBe(4);
  await request.post("http://127.0.0.1:4010/control?scenario=normal");
  await submit();
  await expect(page).toHaveURL(/onboarding/);
  expect(await read()).toBe(5);
  await submit();
  await expect(page).toHaveURL(/onboarding/);
  expect(await read()).toBe(5);
});
