import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/admin/traffic");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "관리자 로그인 세션 없음 - 스킵");
  }
});

test("오늘 실사용자 통계를 기본으로 표시하고 내부 방문을 선택적으로 포함한다", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "방문 통계" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "방문 주체" })).toBeVisible();
  await expect(page.getByRole("button", { name: "오늘" })).toHaveClass(
    /bg-gray-950|dark:bg-white/,
  );
  const internalSwitch = page.getByRole("switch", {
    name: "내부·자동 방문 포함",
  });
  await expect(internalSwitch).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "관리자·운영자" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "자동 검사·봇" })).toHaveCount(0);

  const response = await page.request.get("/api/admin/traffic");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();

  expect(payload.rangeDays).toBe(1);
  expect(payload.includeInternal).toBe(false);
  expect(Array.isArray(payload.actorBreakdown)).toBeTruthy();
  expect(
    payload.actorBreakdown.every(
      (actor: { key?: string; automated_pageviews?: number }) =>
        (actor.key === "visitor" || actor.key === "member") &&
        actor.automated_pageviews === 0,
    ),
  ).toBeTruthy();

  await internalSwitch.click();
  await expect(internalSwitch).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("button", { name: "관리자·운영자" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "자동 검사·봇" }),
  ).toBeVisible();

  const internalResponse = await page.request.get(
    "/api/admin/traffic?days=1&include_internal=1",
  );
  expect(internalResponse.ok()).toBeTruthy();
  const internalPayload = await internalResponse.json();

  expect(internalPayload.includeInternal).toBe(true);
  expect(Array.isArray(internalPayload.actorBreakdown)).toBeTruthy();
  expect(Array.isArray(internalPayload.recentVisits)).toBeTruthy();
  expect(
    internalPayload.recentVisits.every(
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
