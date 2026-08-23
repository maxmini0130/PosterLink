import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_ADMIN_EMAIL) {
    test.skip(true, "E2E_ADMIN_EMAIL 미설정 - 관리자 운영 테스트 스킵");
    return;
  }

  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "관리자 로그인 세션 없음 - 스킵");
  }
});

test.describe("관리자 운영 화면", () => {
  test("공지 발송 화면과 최근 공지 API를 확인한다", async ({ page }) => {
    await page.goto("/admin/notifications");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "관리자 알림" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "시스템 공지 발송" })).toBeVisible();
    await expect(page.getByPlaceholder("공지 제목")).toBeVisible();
    await expect(page.getByPlaceholder("공지 내용")).toBeVisible();
    await expect(page.getByRole("button", { name: "전체 공지 발송" })).toBeDisabled();

    const response = await page.request.get("/api/admin/notifications");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(Array.isArray(payload.notifications)).toBeTruthy();
    expect(Array.isArray(payload.collection_alerts)).toBeTruthy();
  });

  test("기준정보 관리는 카테고리와 지역만 노출한다", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Master Data/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "카테고리" })).toBeVisible();
    await expect(page.getByRole("button", { name: "지역" })).toBeVisible();
    await expect(page.getByRole("button", { name: /유저 권한|사용자 권한/ })).toHaveCount(0);
  });

  test("신고 관리 화면의 비파괴 검수 요소를 확인한다", async ({ page }) => {
    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Report Center/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /신고 대기/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /전체 질문/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /전체 후기/ })).toBeVisible();
  });
});
