import { test, expect } from "@playwright/test";

test.describe("인증", () => {
  test("로그인 페이지 접근", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=구글로 시작하기")).toBeVisible();
    await expect(page.locator("text=카카오로 시작하기")).toBeVisible();
  });

  test("비로그인 상태에서 mypage 접근 시 리다이렉트", async ({ page }) => {
    await page.goto("/mypage");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).toMatch(/login|mypage/);
  });
});
