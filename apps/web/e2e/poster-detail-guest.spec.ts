import { expect, test, type Page } from "@playwright/test";

// Local checks of the redesigned detail page against real published posters.
// Needs E2E_DETAIL_POSTER_ID (an accepting poster with an official_apply link);
// see playwright.ui-components.config.ts. Every write leaving the browser is
// blocked, so nothing reaches the database.
const POSTER = process.env.E2E_DETAIL_POSTER_ID ?? "";
test.skip(!POSTER, "set E2E_DETAIL_POSTER_ID to an accepting poster id");

async function blockWrites(
  page: Page,
  hold?: Promise<void>,
  onHeld?: () => void,
) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (hold && /\/auth\/v1\/user/.test(url)) {
      onHeld?.();
      await hold;
      return route.abort();
    }
    if (
      route.request().method() === "GET" &&
      /\/api\/image-proxy|\/storage\/v1\/object\/public\//.test(url)
    )
      return route.continue();
    return /supabase\.co|\/api\/|sentry\.io/.test(url)
      ? route.abort()
      : route.continue();
  });
}

const favoriteButton = (page: Page) =>
  page.locator(".pl-action-bar").getByRole("button", { name: /찜/ });

test("a guest favorite is kept in this browser, with one toast and the account sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await blockWrites(page);
  await page.goto(`/posters/${POSTER}`, { waitUntil: "networkidle" });
  const favorite = favoriteButton(page);
  for (let i = 0; i < 3; i++) {
    await favorite.click();
    await page.waitForTimeout(200);
  }
  // Pressed three times: favorited, and still one visible toast.
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  const visibleToasts = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('[role="status"]')].filter(
          (element) =>
            element.textContent?.includes("이 기기에 저장됐어요") &&
            getComputedStyle(element).opacity !== "0",
        ).length,
    );
  expect(await visibleToasts()).toBe(1);
  const toast = page
    .getByRole("status")
    .filter({ hasText: "이 기기에 저장됐어요" })
    .last();
  const bar = await page.locator(".pl-action-bar").boundingBox();
  const box = await toast.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y + 1);
  await toast.getByRole("button", { name: "계정에 보관하기" }).click();
  await expect(
    page.getByRole("dialog", { name: "찜한 공고를 계정에 보관할까요?" }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(await visibleToasts()).toBe(0);
  // "다른 방법으로 로그인" keeps the action and its return path.
  await page.getByRole("button", { name: "다른 방법으로 로그인" }).click();
  await page.waitForURL(/\/login/);
  const pending = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pl.pending_action.v1") ?? "null"),
  );
  expect(pending).toMatchObject({
    v: 2,
    type: "favorite",
    targetId: POSTER,
    returnTo: `/posters/${POSTER}`,
  });
});

// Codex review 31abbbb P2-3: a late initial lookup must not undo a completion.
test("a slower initial account lookup does not overwrite a completed favorite", async ({
  page,
}) => {
  // Supabase project ref, used for the session cookie name (sb-<ref>-auth-token).
  const ref = process.env.E2E_SUPABASE_REF ?? "";
  test.skip(!ref, "set E2E_SUPABASE_REF to the project ref");
  await page.setViewportSize({ width: 390, height: 900 });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  let held = 0;
  await blockWrites(page, hold, () => (held += 1));
  // A fake session, set only in the browser, makes the lookup go to the
  // network, where it is held and then aborted.
  await page.addInitScript((projectRef) => {
    const session = {
      access_token: "fake",
      refresh_token: "fake",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "00000000-0000-4000-8000-000000000000",
        aud: "authenticated",
        role: "authenticated",
      },
    };
    const encoded = btoa(JSON.stringify(session))
      .split("+")
      .join("-")
      .split("/")
      .join("_")
      .split("=")
      .join("");
    document.cookie = `sb-${projectRef}-auth-token=base64-${encoded}; path=/`;
  }, ref);
  await page.goto(`/posters/${POSTER}`, { waitUntil: "domcontentloaded" });
  const favorite = favoriteButton(page);
  await favorite.waitFor();
  await page.waitForTimeout(2500);
  // The race only exists if the lookup is really in flight.
  expect(held).toBeGreaterThan(0);
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent("pl:pending-action-done", {
          detail: { type: "favorite", targetId: id },
        }),
      ),
    POSTER,
  );
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  release();
  await page.waitForTimeout(1500);
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
});
