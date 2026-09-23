import { expect, test } from "@playwright/test";
import { findPosterIdByStatus } from "../../helpers/posterFixtures";

test("로그인 사용자는 조건 확인 후 저장 완료 화면을 본다", async ({ page }) => {
  const closedId = await findPosterIdByStatus("closed");
  test.skip(!closedId, "검증할 마감 공고가 없습니다.");

  await page.route("**/api/poster-views", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/site-visits", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/alert-events", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/rest/v1/rpc/save_alert_subscription", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify("00000000-0000-0000-0000-000000000001"),
    }),
  );

  await page.goto(`/posters/${closedId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "다음 공고 알림 받기" }).click();

  const authDialog = page.getByRole("dialog", { name: "알림 로그인" });
  test.skip(
    await authDialog.isVisible().catch(() => false),
    "E2E_USER 계정이 없어 로그인 흐름을 건너뜁니다.",
  );

  const confirmDialog = page.getByRole("dialog", { name: "알림 조건 확인" });
  await expect(confirmDialog).toContainText("받을 알림");
  await expect(confirmDialog).toContainText(
    "비슷한 새 공고와 마감 임박 정보를 알려드려요.",
  );
  await confirmDialog
    .getByRole("button", { name: "이 조건으로 알림 받기" })
    .click();
  await expect(confirmDialog).toContainText("알림 신청이 완료됐어요");
});
