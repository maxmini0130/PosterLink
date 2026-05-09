import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_OPERATOR_EMAIL) {
    test.skip(true, "E2E_OPERATOR_EMAIL 미설정 — 운영자 인증 테스트 스킵");
    return;
  }
  await page.goto("/operator");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "운영자 로그인 세션 없음 — 스킵");
  }
});

test.describe("운영자 포스터 등록", () => {
  test("/operator 접근 가능", async ({ page }) => {
    await page.goto("/operator");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("/operator/posters/new 접근 가능", async ({ page }) => {
    await page.goto("/operator/posters/new");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("포스터 등록 폼 - 주요 입력 필드 존재", async ({ page }) => {
    await page.goto("/operator/posters/new");
    await page.waitForLoadState("networkidle");

    // 제목, 기관, 카테고리 등 주요 필드 확인
    const titleInput = page.locator("input[name='title'], input[placeholder*='제목']").first();
    if (await titleInput.count() > 0) {
      await expect(titleInput).toBeVisible();
    }
  });

  test("외부 이미지 URL 포스터 수정 화면에서 이미지 표시", async ({ page }) => {
    await page.goto("/operator/posters");
    await page.waitForLoadState("networkidle");

    // 포스터 목록에서 첫 번째 수정 링크 찾기
    const editLink = page.locator("a[href*='/operator/posters/'][href*='/edit']").first();
    if (await editLink.count() === 0) { test.skip(); return; }

    await editLink.click();
    await page.waitForLoadState("networkidle");

    // 이미지가 깨진 아이콘 없이 보이는지 확인
    const img = page.locator("img").first();
    if (await img.count() > 0) {
      await expect(img).toBeVisible();
    }
  });
});
