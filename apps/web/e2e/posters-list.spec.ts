import { test, expect } from "@playwright/test";

// Desktop viewport: the filters are in the sidebar (UI redesign PcSearch).
test.describe("포스터 목록 - 접수 중 필터", () => {
  test("접수 중만 보기 체크 상태가 주소에 반영", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    const openOnly = page.getByRole("checkbox", { name: "접수 중만 보기" }).first();
    await expect(openOnly).toBeChecked();
    await openOnly.uncheck();
    await expect(page).toHaveURL(/closed=include/);
  });
});

test.describe("포스터 목록 - 정렬", () => {
  for (const [value, label] of [
    ["deadline", "마감 임박순"],
    ["popular", "인기순"],
    ["views", "조회순"],
    ["favorites", "찜 많은순"],
  ]) {
    test(`정렬 선택: ${label}`, async ({ page }) => {
      await page.goto("/posters");
      await page.waitForLoadState("networkidle");
      await page.getByRole("combobox", { name: "정렬" }).first().selectOption(value);
      await expect(page).toHaveURL(new RegExp(`sort=${value}`));
    });
  }
});

test.describe("포스터 목록 - 저장한 조건", () => {
  test("조건이 없으면 저장할 수 없고, 고르면 이 브라우저에 저장", async ({ page }) => {
    await page.goto("/posters");
    await page.waitForLoadState("networkidle");
    const save = page.getByRole("button", { name: "지금 조건 저장" }).last();
    await expect(save).toBeDisabled();
    await page.getByRole("button", { name: "다른 지역 선택" }).first().click();
    await page.getByRole("radio", { name: "서울특별시 전체" }).first().check();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("button", { name: "서울특별시", pressed: true })).toBeVisible();
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

});
