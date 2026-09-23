import { expect, test } from "@playwright/test";
import { findPosterIdByStatus } from "./helpers/posterFixtures";

test.describe("마감 공고 알림 CTA", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/poster-views", (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route("**/api/site-visits", (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route("**/api/alert-events", (route) =>
      route.fulfill({ status: 204 }),
    );
  });

  test("마감 공고에만 CTA를 노출하고 비회원에게 알림 내용을 설명한다", async ({
    page,
  }) => {
    const [closedId, publishedId] = await Promise.all([
      findPosterIdByStatus("closed"),
      findPosterIdByStatus("published"),
    ]);
    test.skip(
      !closedId || !publishedId,
      "검증할 마감/진행 중 공고가 없습니다.",
    );

    await page.goto(`/posters/${closedId}`, { waitUntil: "domcontentloaded" });
    const cta = page.getByTestId("closed-poster-alert-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("이 공고는 마감됐어요");
    await cta.getByRole("button", { name: "다음 공고 알림 받기" }).click();
    await expect(
      page.getByRole("dialog", { name: "알림 로그인" }),
    ).toContainText("로그인하고 원하는 공고만 받아보세요");
    await expect(
      page.getByRole("dialog", { name: "알림 로그인" }),
    ).toContainText("찜한 공고의 마감이 가까워졌을 때");

    await page.goto(`/posters/${publishedId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("closed-poster-alert-cta")).toHaveCount(0);
  });

  test("모바일에서 CTA와 공식 링크가 서로 겹치지 않는다", async ({ page }) => {
    const closedId = await findPosterIdByStatus("closed");
    test.skip(!closedId, "검증할 마감 공고가 없습니다.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/posters/${closedId}`, { waitUntil: "domcontentloaded" });

    const cta = page.getByTestId("closed-poster-alert-cta");
    const officialLink = page
      .getByRole("link", { name: /공식|신청 페이지|카카오톡|이메일|전화/ })
      .first();
    await expect(cta).toBeVisible();
    await expect(officialLink).toBeVisible();
    const [ctaBox, linkBox] = await Promise.all([
      cta.boundingBox(),
      officialLink.boundingBox(),
    ]);
    expect(ctaBox).not.toBeNull();
    expect(linkBox).not.toBeNull();
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(linkBox!.y);
  });

  test("알림 링크 재방문을 비식별 이벤트로 기록한다", async ({ page }) => {
    const publishedId = await findPosterIdByStatus("published");
    test.skip(!publishedId, "검증할 진행 중 공고가 없습니다.");
    let eventPayload: Record<string, unknown> | null = null;
    await page.unroute("**/api/alert-events");
    await page.route("**/api/alert-events", async (route) => {
      eventPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 204 });
    });

    await page.goto(
      `/posters/${publishedId}?notification_open=1&notification_type=favorite_deadline`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect.poll(() => eventPayload?.event_name).toBe("notification_open");
    expect(eventPayload).toMatchObject({
      poster_id: publishedId,
      poster_status: "published",
      cta_variant: "favorite_deadline_v1",
    });
    await expect(page).not.toHaveURL(/notification_open/);
  });
});
