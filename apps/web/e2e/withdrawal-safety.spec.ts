import { test, expect } from "@playwright/test";

test("withdrawal request composes the approved email without claiming receipt or deletion", async ({
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
    page.getByText(/링크를 열기만 해서는 요청이 접수되지/),
  ).toBeVisible();
  await expect(
    page.getByText(/계정과 데이터를 삭제하지 않습니다/),
  ).toBeVisible();
  const compose = page.getByRole("link", {
    name: "탈퇴 요청 이메일 작성",
    exact: true,
  });
  await expect(compose).toBeVisible();
  const email = new URL((await compose.getAttribute("href"))!);
  expect(email.protocol).toBe("mailto:");
  expect(email.pathname).toBe("maxmini@maxmini.co.kr");
  expect(email.searchParams.get("subject")).toBe(
    "PosterLink 회원 탈퇴 및 개인정보 삭제 요청",
  );
  expect([...email.searchParams.keys()]).toEqual(["subject"]);
  await compose.click({ trial: true });
  await expect(
    page.getByText(/비밀번호·인증 토큰·주민등록번호·신분증 사본/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "탈퇴하기", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("계정이 삭제되었습니다.", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("withdrawal-temporary-mailbox.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto("/privacy");
  await expect(
    page.getByText("개인정보처리자: 주식회사 맥스미니"),
  ).toBeVisible();
  await expect(
    page.getByText("개인정보 보호책임자: 김정민 대표이사"),
  ).toBeVisible();
  const privacyLinks = page.locator('a[href^="mailto:"]');
  expect(await privacyLinks.count()).toBeGreaterThan(0);
  for (const link of await privacyLinks.all())
    await expect(link).toHaveAttribute("href", "mailto:maxmini@maxmini.co.kr");
  expect(await page.locator("body").innerText()).not.toMatch(
    /posterlink@maxmini\.co\.kr|contact@posterlink\.kr|privacy@posterlink\.kr/,
  );
  expect(deletes).toEqual([]);
});
