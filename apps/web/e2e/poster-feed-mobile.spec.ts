import { expect, test } from "@playwright/test";

// Public reads only. Favorites in this flow stay in this browser. Never log in,
// submit an application, or let tracking/mutation requests reach the database.
const detailId = process.env.E2E_DETAIL_POSTER_ID;
test("mobile guest feed → favorite → my posters → detail stays usable", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !detailId,
    "Set an accepting public poster ID for the detail check",
  );
  const blocked: Array<{ method: string; path: string }> = [];
  const reads = new Set([
    "search_public_posters",
    "count_public_posters",
    "get_popular_keywords",
    "resolve_closed_poster_alert_default",
  ]);
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      /google-analytics\.com|googletagmanager\.com|sentry\.io|vercel\.live/.test(
        url.hostname,
      )
    )
      return route.abort();
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      !reads.has(url.pathname.split("/").pop())
    ) {
      blocked.push({ method: request.method(), path: url.pathname });
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-feed-card]").first()).toBeVisible({
    timeout: 30000,
  });
  expect(new URL(page.url()).pathname).toBe("/");
  expect(
    await page
      .locator(".feed-grid")
      .first()
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(2);
  await expect(page.getByText(/방문 이후/)).toHaveCount(0);
  const card = page.locator("[data-feed-card]").first();
  const favoriteId = await card.getAttribute("data-feed-card");
  const button = card.getByRole("button", { name: "찜하기" });
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect(card.getByRole("button", { name: "찜 취소" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "나중에 할게요" })
    .click();
  await page
    .getByRole("navigation", { name: "주요 탐색" })
    .getByRole("link", { name: "찜", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "이 기기에 찜한 공고 1개" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(
          localStorage.getItem("pl.guest_favorites.v1") ?? "null",
        )?.items?.some((item: { posterId: string }) => item.posterId === id),
      favoriteId,
    ),
  ).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "이 기기에 찜한 공고 1개" }),
  ).toBeVisible();
  await page.goto(`/posters/${detailId}`, { waitUntil: "domcontentloaded" });
  const bar = page.locator(".pl-action-bar");
  await expect(bar).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "주요 탐색" }),
  ).toBeHidden();
  for (const fontSize of ["100%", "200%"]) {
    await page.evaluate(
      (size) => (document.documentElement.style.fontSize = size),
      fontSize,
    );
    const rect = await bar.boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    await bar.getByRole("button", { name: /찜/ }).click({ trial: true });
    await page.screenshot({
      path: testInfo.outputPath(`detail-${fontSize}.png`),
    });
  }
  await testInfo.attach("blocked-mutations", {
    body: JSON.stringify(blocked),
    contentType: "application/json",
  });
});
