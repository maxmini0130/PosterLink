import { test, expect } from "@playwright/test";

for (const inset of [0, 34]) {
  test(`detail actions remain tappable with bottom inset ${inset}px`, async ({
    page,
    context,
    request,
    baseURL,
  }, testInfo) => {
    test.skip(
      !testInfo.project.use.isMobile,
      "Run through playwright.mobile.config.ts for mobile browser engines",
    );
    await context.route("**/api/**", (route) =>
      ["GET", "HEAD"].includes(route.request().method())
        ? route.continue()
        : route.abort(),
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => {
          document.documentElement.dataset.shareCalled = "true";
        },
      });
    });
    const list = await (await request.get("/posters")).text();
    const path = list.match(/href="(\/posters\/[0-9a-f-]{36})"/)?.[1];
    expect(path).toBeTruthy();
    await page.goto(path!);
    await expect(page.locator("h1")).toBeVisible();
    if (inset)
      await page.addStyleTag({
        content: `:root { --mobile-nav-height: calc(52px + ${inset}px); } .mobile-bottom-nav { padding-bottom: ${inset}px; }`,
      });
    await page.evaluate(() => document.fonts.ready);
    const actions = page.getByRole("group", { name: "공고 상세 동작" });
    const nav = page.getByRole("navigation", { name: "주요 탐색" });
    const actionBox = (await actions.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(navBox.y + 1);
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
    await actions.getByRole("button", { name: "찜하기", exact: true }).click();
    await expect(
      page.getByText("로그인이 필요합니다.", { exact: true }).first(),
    ).toBeVisible();
    await actions
      .getByRole("button", { name: "공유하기", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-share-called",
      "true",
    );
    // Prove the application link receives a real click without contacting a
    // provider, sending a form or persisting the click analytics.
    const apply = actions.getByRole("link");
    const href = await apply.getAttribute("href");
    expect(href).toMatch(/^https?:\/\//);
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest() &&
      new URL(route.request().url()).origin !== new URL(baseURL!).origin
        ? route.fulfill({
            status: 200,
            contentType: "text/html",
            body: "Application destination intercepted by regression test",
          })
        : route.fallback(),
    );
    const popupPromise = context.waitForEvent("page");
    await apply.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toBe(href);
    await popup.close();
    await expect(page.locator("textarea")).toBeDisabled();
    await nav.getByRole("link", { name: "홈", exact: true }).click();
    await expect(page).toHaveURL(baseURL! + "/");
  });
}
