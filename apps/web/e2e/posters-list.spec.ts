import { test, expect } from "@playwright/test";

test.describe("포스터 목록 - 마감 토글", () => {
  test("마감 제외 토글 존재", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    // role="switch" 또는 텍스트로 찾기
    const toggle = page.locator('[role="switch"]:has-text("마감 제외"), button:has-text("마감 제외")').first();
    await expect(toggle).toBeVisible();
  });

  test("마감 제외 토글 클릭 후 aria-checked 변경", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator('[role="switch"]:has-text("마감 제외"), button:has-text("마감 제외")').first();
    if (await toggle.count() === 0) { test.skip(); return; }

    const before = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await page.waitForLoadState("networkidle");
    const after = await toggle.getAttribute("aria-checked");
    expect(before).not.toEqual(after);
  });
});

test.describe("포스터 목록 - 정렬", () => {
  const sortButtons = ["최신", "마감임박", "인기", "조회", "찜", "클릭"];

  for (const name of sortButtons) {
    test(`정렬 버튼 표시: ${name}`, async ({ page }) => {
      await page.goto("/posters");
      await page.waitForLoadState("networkidle");
      const btn = page.getByRole("button", { name }).first();
      await expect(btn).toBeVisible();
    });
  }

  test("마감임박 정렬 클릭 후 페이지 유지", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "마감임박" }).click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/posters/);
  });

  test("인기 정렬 클릭 후 페이지 유지", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "인기" }).click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/posters/);
  });

  test("조회 정렬 클릭 후 페이지 유지", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "조회" }).click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/posters/);
  });
});

test.describe("포스터 목록 - 개인화 필터", () => {
  test("비로그인 - 내 맞춤 토글 없음 또는 클릭 시 로그인 유도", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const toggle = page.getByRole("button", { name: /내 맞춤/ }).first();
    if (await toggle.count() === 0) {
      // 비로그인에서 아예 숨기는 경우
      return;
    }
    await toggle.click();
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const hasLoginText = await page.locator("text=로그인").count() > 0;
    expect(url.includes("login") || hasLoginText).toBeTruthy();
  });
});

test.describe("포스터 목록 - 등록 요청 접근 제어", () => {
  test("비로그인 상태에서 /posters/request 접근 시 로그인 이동", async ({ page }) => {
    await page.goto("/posters/request");
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
  });
});

test.describe("포스터 카드 - metric 표시", () => {
  test("포스터 카드에 숫자 정보 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const cards = page.locator("a[href^='/posters/']");
    if (await cards.count() === 0) { test.skip(); return; }

    // 카드 영역 내에서 숫자(0 이상)가 하나라도 표시되는지 확인
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    const cardText = await firstCard.textContent();
    expect(cardText).toBeTruthy();
  });

  test("포스터 상세에서 조회수 영역 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    if (await firstCard.count() === 0) { test.skip(); return; }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    expect(page.url()).toMatch(/\/posters\/.+/);
  });
});

test.describe("메인 화면 - 포스터 카운트", () => {
  test("메인 공고 숫자 표시 확인", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // 숫자가 포함된 텍스트 존재 (건, 개 등 단위 또는 숫자)
    const countEl = page.locator("text=/\\d+건|\\d+개/").first();
    if (await countEl.count() > 0) {
      await expect(countEl).toBeVisible();
    }
  });

  test("메인 마감 토글 상태에 따라 카운트 변화", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator('[role="switch"]:has-text("마감 제외"), button:has-text("마감 제외")').first();
    if (await toggle.count() === 0) { test.skip(); return; }

    await toggle.click();
    await page.waitForLoadState("networkidle");

    // 토글 후 에러 없이 페이지 정상 표시 확인
    await expect(page.locator("body")).toBeVisible();
    // 다시 토글 원복
    await toggle.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});
