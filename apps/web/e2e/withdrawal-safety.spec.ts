import { test, expect } from "@playwright/test";

test("withdrawal request cannot pretend receipt or deletion without an available channel", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  if (
    !baseURL ||
    !new URL(baseURL).hostname.endsWith(".vercel.app") ||
    process.env.WITHDRAWAL_SYNTHETIC_SESSION !== "true"
  )
    throw Error("ISOLATED_PREVIEW_SESSION_REQUIRED");
  await context.route("**/*", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.abort(),
  );
  await context.route(
    /google-analytics\.com|googletagmanager\.com|vercel\.live/,
    (route) => route.abort(),
  );
  const deletes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE")
      deletes.push(new URL(request.url()).pathname);
  });
  await page.goto("/mypage");
  await page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  await expect(
    page.getByText(/이 화면에서는 탈퇴·삭제 요청이 접수되지 않습니다/),
  ).toBeVisible();
  await expect(
    page.getByText(/계정과 데이터를 삭제하지 않습니다/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "탈퇴·삭제 요청하기", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "탈퇴하기", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("계정이 삭제되었습니다.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("withdrawal-unavailable.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto("/privacy");
  await expect(
    page.getByText("현재 수신이 확인된 개인정보 문의 경로를 준비 중입니다."),
  ).toBeVisible();
  await expect(
    page.getByText("문의 경로 준비 중", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(
    /posterlink@maxmini\.co\.kr|contact@posterlink\.kr|privacy@posterlink\.kr/,
  );
  expect(deletes).toEqual([]);
});
