import { test, expect, type Page } from "@playwright/test";

async function gotoNoticeCandidates(page: Page) {
  await page.goto("/admin/notice-candidates");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    test.skip(true, "관리자 로그인 세션 없음 — 이미지 없는 공고 후보 테스트 스킵");
  }
  await expect(page.getByRole("heading", { name: "이미지 없는 공고 후보" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  if (!process.env.E2E_ADMIN_EMAIL) {
    test.skip(true, "E2E_ADMIN_EMAIL 미설정 — 관리자 인증 테스트 스킵");
    return;
  }
  await gotoNoticeCandidates(page);
});

test.describe("관리자 이미지 없는 공고 후보", () => {
  test("요약 카드와 필터 컨트롤 표시", async ({ page }) => {
    await expect(page.getByText("대기 후보")).toBeVisible();
    await expect(page.getByText("포스터 생성 작업 중")).toBeVisible();
    await expect(page.getByText("포스터로 게시 완료")).toBeVisible();
    await expect(page.getByPlaceholder("제목, 기관, 수집원 검색")).toBeVisible();
    await expect(page.getByRole("button", { name: /중복 의심만/ })).toBeVisible();
  });

  test("후보 선택 후 일괄 처리 버튼 활성화와 확인창 취소", async ({ page }) => {
    const bulkDrafting = page.getByRole("button", { name: "선택 제작중" });
    if (await bulkDrafting.count() === 0) {
      test.skip(true, "현재 목록에 후보가 없어 일괄 처리 테스트 스킵");
      return;
    }

    await expect(bulkDrafting).toBeDisabled();
    await expect(page.getByRole("button", { name: "선택 보관" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "선택 제외" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "선택 삭제" })).toBeDisabled();

    await page.getByRole("checkbox", { name: /현재 목록 전체 선택/ }).check();

    await expect(bulkDrafting).toBeEnabled();
    await expect(page.getByRole("button", { name: "선택 보관" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "선택 제외" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "선택 삭제" })).toBeEnabled();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("선택한 후보");
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "선택 제외" }).click();

    await expect(page.getByRole("heading", { name: "이미지 없는 공고 후보" })).toBeVisible();
  });

  test("중복 비교 동작 확인", async ({ page }) => {
    await page.getByRole("button", { name: /중복 의심만/ }).click();
    await page.waitForLoadState("networkidle");

    const compareButton = page.getByRole("button", { name: "중복 비교" });
    if (await compareButton.count() === 0) {
      test.skip(true, "현재 중복 의심 후보가 없어 비교 모달 테스트 스킵");
      return;
    }

    const popupPromise = page.waitForEvent("popup", { timeout: 3000 }).catch(() => null);
    await compareButton.first().click();
    const popup = await popupPromise;

    if (popup) {
      await popup.waitForLoadState("domcontentloaded");
      expect(popup.url()).toContain("/admin/posters");
      await popup.close();
      return;
    }

    await expect(page.getByRole("heading", { name: "중복 후보 비교" })).toBeVisible();
    await expect(page.getByText("현재 후보")).toBeVisible();
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("heading", { name: "중복 후보 비교" })).toBeHidden();
  });
});
