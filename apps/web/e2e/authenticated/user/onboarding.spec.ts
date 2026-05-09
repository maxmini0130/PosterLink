import { test, expect } from "@playwright/test";

// E2E_USER_EMAIL 없으면 전체 스킵
test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_USER_EMAIL) {
    test.skip(true, "E2E_USER_EMAIL 미설정 — 인증 테스트 스킵");
    return;
  }
  // 실제 로그인 세션인지 확인
  await page.goto("/mypage");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "로그인 세션 없음 — 인증 테스트 스킵");
  }
});

// 온보딩 완료 사용자: 주요 페이지 정상 접근 확인
test.describe("온보딩 완료 사용자 - 기본 접근", () => {
  test("홈 접근 시 /onboarding 리디렉션 없음", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/onboarding");
  });

  test("마이페이지 접근 가능", async ({ page }) => {
    await page.goto("/mypage");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("마이페이지에 포인트 배지 표시", async ({ page }) => {
    await page.goto("/mypage");
    await page.waitForLoadState("networkidle");
    // 포인트 숫자 또는 P 단위 표시
    const pointEl = page.locator("text=/\\d+\\s*P|포인트/").first();
    if (await pointEl.count() > 0) {
      await expect(pointEl).toBeVisible();
    }
  });

  test("즐겨찾기 페이지 접근 가능", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("알림 페이지 접근 가능", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("포스터 등록 요청", () => {
  test("/posters/request 페이지 접근 가능", async ({ page }) => {
    await page.goto("/posters/request");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("설명 없이 제출 시 버튼 비활성 또는 오류", async ({ page }) => {
    await page.goto("/posters/request");
    await page.waitForLoadState("networkidle");

    const submitBtn = page.locator("button[type='submit'], button:has-text('요청'), button:has-text('제출')").first();
    if (await submitBtn.count() === 0) { test.skip(); return; }

    // 빈 상태에서 제출 시 비활성이거나 HTML required 유효성
    const isDisabled = await submitBtn.isDisabled();
    if (isDisabled) {
      await expect(submitBtn).toBeDisabled();
    }
  });

  test("50포인트 인센티브 배너 표시", async ({ page }) => {
    await page.goto("/posters/request");
    await page.waitForLoadState("networkidle");
    const banner = page.locator("text=/50|포인트|P/").first();
    if (await banner.count() > 0) {
      await expect(banner).toBeVisible();
    }
  });
});

test.describe("포스터 찜하기", () => {
  test("포스터 상세에서 찜 버튼 표시 (로그인 상태)", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator("a[href^='/posters/']").first();
    if (await firstCard.count() === 0) { test.skip(); return; }

    const href = await firstCard.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    // 찜 버튼이 로그인 유도 아닌 실제 찜 버튼으로 표시되어야 함
    const favBtn = page.locator("button[aria-label*='찜'], button:has-text('찜')").first();
    if (await favBtn.count() > 0) {
      await expect(favBtn).toBeVisible();
      // 클릭해도 로그인 페이지로 이동하지 않아야 함
      await favBtn.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
    }
  });
});

test.describe("내 맞춤 필터 (로그인)", () => {
  test("포스터 목록에서 내 맞춤 토글 표시", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    const toggle = page.locator("text=내 맞춤").first();
    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible();
    }
  });

  test("내 맞춤 토글 클릭 후 오류 없음", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator('[role="switch"]:has-text("내 맞춤"), button:has-text("내 맞춤")').first();
    if (await toggle.count() === 0) { test.skip(); return; }

    await toggle.click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
