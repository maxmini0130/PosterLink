import { expect, test, type Page } from "@playwright/test";

// Runs only against a server started with UI_SHOWCASE=1 (see
// playwright.ui-components.config.ts); the review page is a 404 elsewhere.
test.skip(process.env.E2E_UI_SHOWCASE !== "1", "needs the /dev/ui review page");

test.beforeEach(async ({ page }) => {
  // Never reach Production services from these checks.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return /supabase\.co|\/api\/|sentry\.io/.test(url)
      ? route.abort()
      : route.continue();
  });
});

const focusInDialog = (page: Page) =>
  page.evaluate(() =>
    Boolean(document.activeElement?.closest('[role="dialog"]')),
  );

async function tabAround(page: Page, times = 6) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInDialog(page)).toBe(true);
  }
  for (let i = 0; i < times; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInDialog(page)).toBe(true);
  }
}

for (const width of [390, 1280]) {
  test(`sheet traps focus, closes with Escape and restores focus @${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dev/ui");
    const opener = page.getByRole("button", { name: "바텀시트 열기" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "찜한 공고를 계정에 보관할까요?",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await focusInDialog(page)).toBe(true);
    await tabAround(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
}

test("hidden, untabbable and later-disabled controls do not let focus escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dev/ui");
  await page.getByRole("button", { name: "예외 시트 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "예외 상태 확인용 시트" });
  await expect(dialog).toBeVisible();
  // The disabled-fieldset input, the hidden button and the tabindex=-1 button
  // are skipped.
  await expect(
    page.getByRole("button", { name: "아래 버튼 비활성화" }),
  ).toBeFocused();
  // Codex re-review e1fdecb: Shift+Tab first must not leave the sheet.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInDialog(page)).toBe(true);
    await expect(page.getByLabel("비활성 묶음 안 입력")).not.toBeFocused();
  }
  await tabAround(page);
  // Disable the primary button while the sheet is open.
  await page.getByRole("button", { name: "아래 버튼 비활성화" }).click();
  await expect(
    page.getByRole("button", { name: "나중에 비활성화되는 버튼" }),
  ).toBeDisabled();
  await tabAround(page);
  // Focus moved behind the sheet by script comes back inside.
  await page.evaluate(() =>
    (document.querySelector("main a") as HTMLElement | null)?.focus(),
  );
  expect(await focusInDialog(page)).toBe(true);
});

for (const [name, viewport, fontSize] of [
  ["short screen", { width: 390, height: 240 }, null],
  ["200% text", { width: 390, height: 600 }, "200%"],
] as const) {
  test(`sheet stays on screen and scrolls on a ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dev/ui");
    if (fontSize)
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = size),
        fontSize,
      );
    await page.getByRole("button", { name: "바텀시트 열기" }).click();
    const dialog = page.getByRole("dialog", {
      name: "찜한 공고를 계정에 보관할까요?",
    });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    // The title is fully on screen and the last button can be scrolled into view.
    const title = await dialog.getByRole("heading").boundingBox();
    expect(title!.y).toBeGreaterThanOrEqual(0);
    const dismiss = dialog.getByRole("button", { name: "나중에 할게요" });
    await dismiss.scrollIntoViewIfNeeded();
    await expect(dismiss).toBeInViewport();
    await dismiss.click();
    await expect(dialog).toBeHidden();
  });
}
