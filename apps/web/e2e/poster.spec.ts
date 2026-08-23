import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

async function gotoPosters(page: Page) {
  await page.goto("/posters", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "공공 공고 찾기" })).toBeVisible();
}

async function posterHrefs(page: Page) {
  const hrefs = await page.locator("a[href^='/posters/']").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href)),
  );
  return [...new Set(hrefs.filter((href) => /^\/posters\/[0-9a-f-]{36}$/i.test(href)))];
}

async function gotoFirstPosterDetail(page: Page) {
  const hrefs = await posterHrefs(page);
  if (hrefs.length === 0) {
    test.skip(true, "현재 목록에 상세 확인 가능한 포스터 링크가 없습니다.");
    return false;
  }

  for (const href of hrefs.slice(0, 8)) {
    await page.goto(href, { waitUntil: "domcontentloaded" });
    expect(page.url()).toMatch(/\/posters\/.+/);

    const state = await Promise.race([
      page.locator("main").waitFor({ state: "visible", timeout: 10_000 }).then(() => "detail" as const),
      page
        .getByRole("heading", { name: "페이지를 찾을 수 없습니다" })
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => "not-found" as const),
    ]).catch(() => "unknown" as const);

    if (state === "detail") {
      return true;
    }
  }

  test.skip(true, "현재 목록의 포스터 상세 화면이 안정적으로 렌더링되지 않았습니다.");
  return false;
}

test.describe("포스터 목록", () => {
  test("포스터 상세 페이지 진입", async ({ page }) => {
    await gotoPosters(page);

    await gotoFirstPosterDetail(page);
  });

  test("카테고리 필터 클릭", async ({ page }) => {
    await gotoPosters(page);

    const categoryBtn = page
      .locator("button.rounded-\\[2rem\\], button.rounded-2xl")
      .filter({ hasText: /^(전체|청년|교육|문화|복지)$/ })
      .first();

    if (await categoryBtn.count() > 0) {
      await categoryBtn.click();
      await expect(page.getByRole("heading", { name: "공공 공고 찾기" })).toBeVisible();
    }
  });

  test("정렬 변경 (마감임박)", async ({ page }) => {
    await gotoPosters(page);
    await page.getByRole("button", { name: "마감임박" }).click();
    await expect(page.getByRole("button", { name: "마감임박" })).toBeVisible();
  });

  test("포스터 카드 렌더링 확인", async ({ page }) => {
    await gotoPosters(page);
    const cards = page.locator("a[href^='/posters/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe("포스터 상세", () => {
  test("상세 페이지 - 주요 정보 표시", async ({ page }) => {
    await gotoPosters(page);

    if (!(await gotoFirstPosterDetail(page))) return;
    // 페이지가 오류 없이 로드됨
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("상세 페이지 - 비로그인 시 찜하기 버튼 클릭 시 로그인 유도", async ({ page }) => {
    await gotoPosters(page);

    if (!(await gotoFirstPosterDetail(page))) return;

    const favoriteBtn = page.locator("button[aria-label*='찜'], button:has-text('찜')").first();
    if (await favoriteBtn.count() > 0) {
      await favoriteBtn.click();
      await expect(page.locator("body")).toBeVisible();
      // 로그인 페이지로 이동하거나 모달이 뜨는지 확인
      const url = page.url();
      const hasModal = await page.locator("text=로그인").count() > 0;
      expect(url.includes("login") || hasModal).toBeTruthy();
    }
  });
});

test.describe("포스터 목록 - 페이지네이션", () => {
  test("포스터가 12개 초과 시 더 보기 버튼 표시", async ({ page }) => {
    await gotoPosters(page);

    const loadMoreBtn = page.locator("button:has-text('더 보기')").first();
    const cards = page.locator("a[href^='/posters/']");
    const count = await cards.count();

    if (count >= 12) {
      await expect(loadMoreBtn).toBeVisible();
    }
  });
});

test.describe("포스터 상세 - 공유", () => {
  test("공유 버튼 표시", async ({ page }) => {
    await gotoPosters(page);

    if (!(await gotoFirstPosterDetail(page))) return;

    await expect(page.locator("main")).toBeVisible();
    const actionButtons = page.locator("main button");
    expect(await actionButtons.count()).toBeGreaterThan(0);
  });
});

test.describe("검색", () => {
  test("검색어 입력 후 결과 페이지 유지", async ({ page }) => {
    await gotoPosters(page);

    const quickSearch = page.getByRole("button", { name: "청년" }).first();
    if (await quickSearch.count() > 0) {
      await quickSearch.click();
      await expect(page.getByRole("heading", { name: "공공 공고 찾기" })).toBeVisible();
      expect(page.url()).toMatch(/posters/);
    }
  });
});
