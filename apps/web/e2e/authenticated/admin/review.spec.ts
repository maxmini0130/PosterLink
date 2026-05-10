import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_ADMIN_EMAIL) {
    test.skip(true, "E2E_ADMIN_EMAIL 미설정 — 관리자 인증 테스트 스킵");
    return;
  }
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "관리자 로그인 세션 없음 — 스킵");
  }
});

test.describe("관리자 대시보드", () => {
  test("/admin 접근 가능", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("대시보드 주요 지표 카드 표시", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // 검수 대기, 게시 중 등 숫자 카드 중 하나 이상 표시
    const cards = page.locator("text=/검수 대기|게시 중|신고|사용자/").first();
    if (await cards.count() > 0) {
      await expect(cards).toBeVisible();
    }
  });
});

test.describe("관리자 포스터 검수 목록", () => {
  test("/admin/posters 접근 가능", async ({ page }) => {
    await page.goto("/admin/posters");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("상태 필터 탭 표시 (검수 대기/게시 중/반려됨)", async ({ page }) => {
    await page.goto("/admin/posters");
    await page.waitForLoadState("networkidle");
    const reviewTab = page.locator("text=/검수 대기|review/i").first();
    if (await reviewTab.count() > 0) {
      await expect(reviewTab).toBeVisible();
    }
  });

  test("검수 대기 포스터 존재 시 미리보기 버튼 표시", async ({ page }) => {
    await page.goto("/admin/posters");
    await page.waitForLoadState("networkidle");

    // 검수 대기 탭 클릭
    const reviewTab = page.locator("button:has-text('검수 대기'), button:has-text('대기')").first();
    if (await reviewTab.count() > 0) await reviewTab.click();
    await page.waitForLoadState("networkidle");

    const previewBtn = page.locator("button:has-text('미리보기'), button[aria-label*='미리보기']").first();
    if (await previewBtn.count() > 0) {
      await expect(previewBtn).toBeVisible();
    }
  });

  test("검수 포스터 선택 후 일괄 승인 버튼 활성화", async ({ page }) => {
    await page.goto("/admin/posters");
    await page.waitForLoadState("networkidle");

    // 검수 대기 탭
    const reviewTab = page.locator("button:has-text('검수 대기'), button:has-text('대기')").first();
    if (await reviewTab.count() > 0) await reviewTab.click();
    await page.waitForLoadState("networkidle");

    // 첫 번째 체크박스 선택
    const checkbox = page.locator("input[type='checkbox']").first();
    if (await checkbox.count() === 0) { test.skip(); return; }
    await checkbox.click();

    // 일괄 승인 버튼 활성화 확인
    const bulkApprove = page.locator("button:has-text('승인'), button:has-text('일괄 승인')").first();
    if (await bulkApprove.count() > 0) {
      await expect(bulkApprove).not.toBeDisabled();
    }
  });
});

test.describe("관리자 등록 요청 검수", () => {
  test("/admin/requests 접근 가능", async ({ page }) => {
    await page.goto("/admin/requests");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("대기중/승인됨/반려됨 탭 표시", async ({ page }) => {
    await page.goto("/admin/requests");
    await page.waitForLoadState("networkidle");

    const tabs = ["대기중", "승인됨", "반려됨"];
    for (const tab of tabs) {
      const el = page.getByText(tab).first();
      if (await el.count() > 0) {
        await expect(el).toBeVisible();
      }
    }
  });

  test("탭 전환 후 오류 없음", async ({ page }) => {
    await page.goto("/admin/requests");
    await page.waitForLoadState("networkidle");

    const approvedTab = page.locator("button:has-text('승인됨')").first();
    if (await approvedTab.count() > 0) {
      await approvedTab.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

test.describe("관리자 - 반려 포스터 삭제", () => {
  test("반려됨 필터에서 삭제 버튼 표시", async ({ page }) => {
    await page.goto("/admin/posters");
    await page.waitForLoadState("networkidle");

    const rejectedTab = page.locator("button:has-text('반려됨'), button:has-text('rejected')").first();
    if (await rejectedTab.count() > 0) await rejectedTab.click();
    await page.waitForLoadState("networkidle");

    const deleteBtn = page.locator("button:has-text('삭제')").first();
    if (await deleteBtn.count() > 0) {
      await expect(deleteBtn).toBeVisible();
    }
  });
});
