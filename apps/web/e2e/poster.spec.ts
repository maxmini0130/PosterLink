import { test, expect } from "@playwright/test";

test.describe("포스터", () => {
  test("포스터 상세 페이지", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    const count = await firstCard.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/\/posters\/.+/);
  });

  test("카테고리 필터", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    // 카테고리 버튼 (Quick Filters 영역 — 전체/청년/교육 등)
    const categoryBtn = page.locator("button.rounded-\\[2rem\\], button.rounded-2xl")
      .filter({ hasText: /^(전체|청년|교육|문화|복지)$/ })
      .first();

    const count = await categoryBtn.count();
    if (count > 0) {
      await categoryBtn.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("정렬 변경 (DEADLINE)", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.click("text=DEADLINE");
    await page.waitForLoadState("networkidle");
  });
});
