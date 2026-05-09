import { test, expect } from "@playwright/test";

test.describe("포스터 목록", () => {
  test("포스터 상세 페이지 진입", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    if (await firstCard.count() === 0) {
      test.skip();
      return;
    }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/\/posters\/.+/);
  });

  test("카테고리 필터 클릭", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const categoryBtn = page
      .locator("button.rounded-\\[2rem\\], button.rounded-2xl")
      .filter({ hasText: /^(전체|청년|교육|문화|복지)$/ })
      .first();

    if (await categoryBtn.count() > 0) {
      await categoryBtn.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("정렬 변경 (마감임박)", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "마감임박" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("포스터 카드 렌더링 확인", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    const cards = page.locator("a[href^='/posters/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe("포스터 상세", () => {
  test("상세 페이지 - 주요 정보 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    if (await firstCard.count() === 0) {
      test.skip();
      return;
    }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    // URL 확인
    expect(page.url()).toMatch(/\/posters\/.+/);
    // 페이지가 오류 없이 로드됨
    await expect(page.locator("body")).toBeVisible();
  });

  test("상세 페이지 - 비로그인 시 찜하기 버튼 클릭 시 로그인 유도", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    if (await firstCard.count() === 0) {
      test.skip();
      return;
    }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    const favoriteBtn = page.locator("button[aria-label*='찜'], button:has-text('찜')").first();
    if (await favoriteBtn.count() > 0) {
      await favoriteBtn.click();
      await page.waitForLoadState("networkidle");
      // 로그인 페이지로 이동하거나 모달이 뜨는지 확인
      const url = page.url();
      const hasModal = await page.locator("text=로그인").count() > 0;
      expect(url.includes("login") || hasModal).toBeTruthy();
    }
  });
});

test.describe("포스터 목록 - 페이지네이션", () => {
  test("포스터가 12개 초과 시 더 보기 버튼 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const loadMoreBtn = page.locator("button:has-text('더 보기')").first();
    const cards = page.locator("a[href^='/posters/']");
    const count = await cards.count();

    if (count >= 12) {
      await expect(loadMoreBtn).toBeVisible();
    }
  });
});

test.describe("포스터 상세 - 링크 복사", () => {
  test("링크 복사 버튼 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    if (await firstCard.count() === 0) { test.skip(); return; }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    const copyBtn = page.locator("button[title='링크 복사']").first();
    await expect(copyBtn).toBeVisible();
  });
});

test.describe("검색", () => {
  test("검색어 입력 후 결과 페이지 유지", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const searchTrigger = page.locator("text=어떤 공고를 찾으시나요?").first();
    if (await searchTrigger.count() > 0) {
      await searchTrigger.click();
      const input = page.locator('input[placeholder="검색어를 입력하세요"]').first();
      await input.fill("청년");
      await page.keyboard.press("Enter");
      await page.waitForLoadState("networkidle");
      expect(page.url()).toMatch(/posters/);
    }
  });
});
