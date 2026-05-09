import { test, expect } from "@playwright/test";

const adminRoutes = [
  "/admin",
  "/admin/posters",
  "/admin/requests",
  "/admin/reports",
  "/admin/notifications",
  "/admin/settings",
];

const operatorRoutes = [
  "/operator",
  "/operator/posters",
  "/operator/posters/new",
];

const userRoutes = [
  "/mypage",
  "/mypage/edit",
  "/favorites",
  "/notifications",
  "/posters/request",
];

test.describe("관리자 라우트 - 비로그인 접근 제어", () => {
  for (const route of adminRoutes) {
    test(`비로그인 → ${route} → 로그인 이동`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
    });
  }
});

test.describe("운영자 라우트 - 비로그인 접근 제어", () => {
  for (const route of operatorRoutes) {
    test(`비로그인 → ${route} → 로그인 이동`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
    });
  }
});

test.describe("사용자 전용 라우트 - 비로그인 접근 제어", () => {
  for (const route of userRoutes) {
    test(`비로그인 → ${route} → 로그인 이동`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
    });
  }
});

test.describe("로그인 페이지 redirectTo 파라미터 유지", () => {
  test("/admin 접근 시 redirectTo=/admin 유지", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirectTo")).toBe("/admin");
  });

  test("/mypage 접근 시 redirectTo=/mypage 유지", async ({ page }) => {
    await page.goto("/mypage");
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirectTo")).toBe("/mypage");
  });
});
