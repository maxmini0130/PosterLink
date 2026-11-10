import { expect, test, type Page } from "@playwright/test";

// v6.1 신청 표시 (docs/design/v6.1/SPEC.md 5) as a guest: the mark lives in
// this browser. Writes to Supabase are blocked here, so nothing reaches a
// database; product events are dropped.
test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.co/, (route) =>
    ["GET", "HEAD"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 204, body: "" }),
  );
});

async function firstOpenPoster(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  const card = page.locator("[data-home-grid] [data-feed-card]").first();
  if (!(await card.count())) return null;
  return card.getAttribute("data-feed-card");
}

test("detail: 신청했어요 shows the band, keeps the deadline, and undoes at once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await firstOpenPoster(page);
  test.skip(!id, "no open poster on the home");
  await page.goto(`/posters/${id}`, { waitUntil: "networkidle" });
  const bar = page.getByRole("group", { name: "공고 행동" });
  const mark = bar.getByRole("button", { name: "신청했어요" });
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  const band = page.locator("[data-applied-band]");
  await expect(band).toContainText("신청한 공고예요");
  await expect(band).toContainText("마감 알림을 껐어요");
  // The mark is this browser's only; no D-day while applied.
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pl.guest_applied.v1") || "null"),
  );
  expect(stored.items[0].posterId).toBe(id);
  await band.getByRole("button", { name: "되돌리기" }).click();
  await expect(band).toHaveCount(0);
  await expect(mark).toHaveAttribute("aria-pressed", "false");
});

test("home: an applied poster's card reads ✓ 신청했어요 without a stamp", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await firstOpenPoster(page);
  test.skip(!id, "no open poster on the home");
  await page.evaluate((posterId) => {
    localStorage.setItem(
      "pl.guest_applied.v1",
      JSON.stringify({ v: 1, items: [{ posterId, appliedAt: Date.now() }] }),
    );
  }, id);
  await page.reload({ waitUntil: "networkidle" });
  const card = page
    .locator(`[data-home-grid] [data-feed-card="${id}"]`)
    .first();
  await expect(card).toContainText("신청했어요");
  await expect(card.getByRole("img", { name: /마감/ })).toHaveCount(0);
});

test("return prompt: asked once after the application page, hides the bar button", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  // Find an open poster whose primary button is a real application page.
  const ids = await page
    .locator("[data-home-grid] [data-feed-card]")
    .evaluateAll((els) =>
      els.slice(0, 12).map((el) => (el as HTMLElement).dataset.feedCard!),
    );
  let found = false;
  for (const id of ids) {
    await page.goto(`/posters/${id}`, { waitUntil: "networkidle" });
    const apply = page
      .getByRole("group", { name: "공고 행동" })
      .getByRole("link", { name: /신청 페이지로 이동/ });
    if (!(await apply.count())) continue;
    found = true;
    const popup = context.waitForEvent("page");
    await apply.click();
    await (await popup).close();
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    const prompt = page.locator("[data-apply-prompt]");
    await expect(prompt).toContainText("신청을 마치셨나요?");
    // The same button is not shown twice.
    await expect(
      page.getByRole("group", { name: "공고 행동" }).getByRole("button", {
        name: "신청했어요",
      }),
    ).toHaveCount(0);
    await prompt.getByRole("button", { name: "아직이에요" }).click();
    await expect(prompt).toHaveCount(0);
    // Never asked again for this poster.
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(prompt).toHaveCount(0);
    break;
  }
  test.skip(!found, "no open poster with an application page on the home");
});
