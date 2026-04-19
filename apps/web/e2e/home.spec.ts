import { test, expect } from "@playwright/test";

test.describe("메인 화면", () => {
  test("메인 페이지 로딩", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/PosterLink/);
    await page.waitForLoadState("networkidle");
  });

  test("포스터 목록 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Explore")).toBeVisible();
  });

  test("포스터 검색", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.click("text=어떤 공고를 찾으시나요?");
    await page.fill('input[placeholder="검색어를 입력하세요"]', "청년");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle");
  });
});
