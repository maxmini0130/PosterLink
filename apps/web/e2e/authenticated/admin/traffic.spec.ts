import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_ADMIN_EMAIL) {
    test.skip(true, "E2E_ADMIN_EMAIL 미설정 - 관리자 인증 테스트 스킵");
    return;
  }

  await page.goto("/admin/traffic");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "관리자 로그인 세션 없음 - 스킵");
  }
});

test("방문 주체 집계와 자동 검사 필터를 표시한다", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "방문 통계" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "방문 주체" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "관리자·운영자" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "자동 검사·봇" }),
  ).toBeVisible();

  const response = await page.request.get("/api/admin/traffic?days=30");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();

  expect(Array.isArray(payload.actorBreakdown)).toBeTruthy();
  expect(Array.isArray(payload.recentVisits)).toBeTruthy();
  expect(
    payload.recentVisits.every(
      (visit: { actor?: { key?: string; is_automated?: boolean } }) =>
        typeof visit.actor?.key === "string" &&
        typeof visit.actor?.is_automated === "boolean",
    ),
  ).toBeTruthy();

  await page.getByRole("button", { name: "자동 검사·봇" }).click();
  await expect(page.getByRole("button", { name: "자동 검사·봇" })).toHaveClass(
    /bg-gray-950|dark:bg-white/,
  );
  await page.screenshot({
    path: "test-results/admin-traffic-actor-classification.png",
    fullPage: true,
  });
});
