import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const readRpc =
      /\/rest\/v1\/rpc\/(search_public_posters|count_public_posters|resolve_closed_poster_alert_default|get_recommended_posters_v2)$/.test(
        url.pathname,
      );
    return ["GET", "HEAD", "OPTIONS"].includes(request.method()) ||
      (request.method() === "POST" && readRpc)
      ? route.continue()
      : route.abort();
  });
});

test("home SSR includes public cards and the same open count as the list", async ({
  browser,
  request,
  baseURL,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect((html.match(/<article\b/g) || []).length).toBeGreaterThanOrEqual(12);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const home = await context.newPage();
  await home.goto(baseURL!);
  const text = await home.locator("body").innerText();
  const count = text.match(/신청 가능한 공고\s*([\d,]+)건/)?.[1];
  expect(count).toBeTruthy();
  await home.goto(`${baseURL}/posters?status=open`);
  await expect(home.getByText(new RegExp(`총 ${count}건`))).toBeVisible();
  expect(await home.locator("article").count()).toBe(12);
  await expect(home.getByText(/현재 12건 표시/)).toBeVisible();
  await context.close();
});

test("closed detail has disabled application, one official destination and no stale source status", async ({
  page,
}) => {
  await page.goto("/posters/5a084e4d-9821-4472-8273-1714603535b4");
  await expect(
    page.getByRole("button", { name: "신청 마감", exact: true }),
  ).toBeDisabled();
  expect(
    await page
      .getByRole("link", { name: "신청 페이지로 이동", exact: true })
      .count(),
  ).toBe(0);
  await expect(
    page.getByText("수집 출처: K-Startup", { exact: true }),
  ).toBeVisible();
  expect(
    (await page.locator("main").innerText()).includes("사업공고 모집중"),
  ).toBe(false);
  const official = page.getByRole("link", {
    name: "공식 공고 보기",
    exact: true,
  });
  expect(await official.count()).toBe(2);
  expect(
    new Set(
      await official.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      ),
    ).size,
  ).toBe(1);
  const coreRegion = page
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: /^대상 지역$/ }) })
    .first();
  await expect(coreRegion).toContainText("지역 확인 필요");
  expect(
    (await page.locator("main").innerText()).includes("지역: 서울특별시"),
  ).toBe(false);
});

test("open detail uses the same application URL for both primary actions", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/posters/discovery?sort=deadline");
  expect(response.ok()).toBe(true);
  const { posters } = await response.json();
  expect(posters.length).toBeGreaterThan(0);
  await page.goto(`/posters/${posters[0].id}`);
  const actions = page.getByRole("link", {
    name: "신청 페이지로 이동",
    exact: true,
  });
  if (await actions.count()) {
    expect(await actions.count()).toBe(2);
    expect(
      new Set(
        await actions.evaluateAll((links) =>
          links.map((link) => link.getAttribute("href")),
        ),
      ).size,
    ).toBe(1);
  } else
    await expect(
      page.getByRole("link", { name: "공식 공고 보기", exact: true }).first(),
    ).toBeVisible();
  expect(
    await page.getByRole("button", { name: "신청 마감", exact: true }).count(),
  ).toBe(0);
});

test("home and closed detail fit the viewport", async ({ page }, testInfo) => {
  for (const pathname of [
    "/",
    "/posters/5a084e4d-9821-4472-8273-1714603535b4",
  ]) {
    await page.goto(pathname);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        pathname === "/" ? "home.png" : "closed-detail.png",
      ),
      fullPage: true,
    });
  }
});
