import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/admin",
  "/admin/posters",
  "/admin/reports",
  "/admin/notifications",
  "/admin/settings",
  "/operator",
  "/operator/posters",
  "/operator/posters/new",
];

test.describe("운영/관리 접근 제어", () => {
  for (const route of protectedRoutes) {
    test(`비로그인 상태에서 ${route} 접근 시 로그인으로 이동`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("redirectTo")).toBe(route);
      await expect(page.locator("h1")).toContainText("로그인");
    });
  }
});
