import { test, expect } from "@playwright/test";

test.describe("메인 화면", () => {
  test("메인 페이지 로딩 및 타이틀", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/PosterLink/);
    await page.waitForLoadState("networkidle");
  });

  test("포스터 목록 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "찾기", exact: true })).toBeVisible();
  });

  test("포스터 검색", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("공고, 기관 검색").fill("청년");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=%EC%B2%AD%EB%85%84/);
    await page.waitForLoadState("networkidle");
  });
});

test.describe("home first visit", () => {
  test("a new browser sees open posters and the 찜 guide, not an empty screen", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: "지금 접수 중인 공고" })).toBeVisible();
    await expect(page.getByText("찜해 두면 다음에 모아 보여드려요")).toBeVisible();
    await expect(page.getByText("방문 이후")).toHaveCount(0);
  });
});

test.describe("헤더", () => {
  test("헤더 로고 이미지 표시", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const logo = page.locator("img[alt='PosterLink'], header img").first();
    await expect(logo).toBeVisible();
  });

  test("비로그인 상태 - 헤더에 로그인 버튼 표시", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const loginLink = page.locator("a[href='/login']").first();
    await expect(loginLink).toBeVisible();
  });

  test("헤더 PosterLink 텍스트 또는 로고 존재", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const brand = page.locator("text=PosterLink").or(page.locator("img[alt='PosterLink']")).first();
    await expect(brand).toBeVisible();
  });
});

test.describe("페이지 접근성", () => {
  test("홈 페이지 200 응답", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
  });

  test("포스터 목록 페이지 200 응답", async ({ page }) => {
    const response = await page.goto("/posters");
    expect(response?.status()).toBeLessThan(400);
  });

  test("로그인 페이지 200 응답", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(400);
  });

  test("회원가입 페이지 200 응답", async ({ page }) => {
    const response = await page.goto("/signup");
    expect(response?.status()).toBeLessThan(400);
  });
});
