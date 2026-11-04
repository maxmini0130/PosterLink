import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const token = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from(
    JSON.stringify({ sub: id, aud: "authenticated", exp: 4102444800 }),
  ).toString("base64url"),
  "fixture",
].join(".");
const session = {
  access_token: token,
  refresh_token: "fixture",
  token_type: "bearer",
  expires_at: 4102444800,
};
const cookie =
  "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:4014/control?scenario=normal");
});

test("fallback read or role failure never becomes a successful zero count", async ({
  request,
}) => {
  for (const scenario of ["fallback-read", "fallback-roles"]) {
    await request.post(`http://127.0.0.1:4014/control?scenario=${scenario}`);
    const response = await request.get("/api/admin/traffic", {
      headers: { Cookie: `sb-127-auth-token=${cookie}` },
    });
    expect(response.status()).toBe(503);
    expect((await response.json()).overview).toBeUndefined();
  }
});

test("real traffic handler separates unknown/self/external and excludes marked tests and bots", async ({
  request,
}) => {
  expect((await request.get("/api/admin/traffic")).status()).toBe(401);
  const headers = { Cookie: `sb-127-auth-token=${cookie}` };
  const response = await request.get("/api/admin/traffic", { headers });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.excludedRows).toBe(3);
  expect(result.overview.period_sessions).toBe(3);
  expect(
    result.sources.map((row: { source: string }) => row.source).sort(),
  ).toEqual(["Google", "사이트 내부 이동", "출처 미확인"].sort());
  expect(
    result.sources.reduce(
      (n: number, row: { sessions: number }) => n + row.sessions,
      0,
    ),
  ).toBe(3);
  const included = await (
    await request.get("/api/admin/traffic?include_internal=1", { headers })
  ).json();
  expect(included.sampledRows).toBe(6);
  expect(
    included.recentVisits.some(
      (row: { actor: { automation_label: string } }) =>
        row.actor.automation_label === "내부 수동 테스트",
    ),
  ).toBe(true);
});

test("test-browser control survives reload and marks anonymous public visits", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await context.addCookies([
    { name: "sb-127-auth-token", value: cookie, url: baseURL! },
  ]);
  await page.addInitScript((value) => {
    if (!localStorage.getItem("fixture.auth.seeded")) {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
      localStorage.setItem("fixture.auth.seeded", "1");
    }
    localStorage.setItem("pl.analytics.consent.v1", "denied");
  }, session);
  const visits: Array<{ automation_source: string | null }> = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/site-visits") {
      visits.push(route.request().postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    if (url.origin === "http://127.0.0.1:4014" || url.origin === baseURL)
      return route.continue();
    return route.abort();
  });
  await page.goto("/admin/traffic");
  await expect(
    page.getByText("출처 미확인", { exact: true }).first(),
  ).toBeVisible();
  await page.getByText("집계 기준과 한계 (한국 시간)", { exact: true }).click();
  const control = page.getByRole("switch", {
    name: "이 브라우저 테스트 방문 제외",
  });
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await page.getByText("집계 기준과 한계 (한국 시간)", { exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("traffic.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  // Remove Auth only; keep the browser test flag. Do not call real sign-out.
  await context.clearCookies();
  await page.evaluate(() => {
    localStorage.removeItem("sb-127-auth-token");
  });
  await page.goto("/login");
  await expect.poll(() => visits.length).toBeGreaterThan(0);
  expect(visits.at(-1)?.automation_source).toBe("manual-test");
});
