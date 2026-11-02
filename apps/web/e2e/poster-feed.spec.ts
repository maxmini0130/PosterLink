import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { parse } from "dotenv";

// Every browser API request is a fixture. No account, writes or image uploads.
const env = parse(readFileSync(".env.local"));
const origin = env.NEXT_PUBLIC_SUPABASE_URL;
const id = (n: number) =>
  `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const labels = [
  "지원금/복지",
  "교육/취업",
  "문화/행사",
  "주거/금융",
  "소상공인",
  "육아/가족",
  "건강/의료",
  "기타",
];
const codes = [
  "WELFARE",
  "EDUCATION",
  "CULTURE",
  "HOUSING",
  "BUSINESS",
  "FAMILY",
  "HEALTH",
  "OTHER",
];
const rows = Array.from({ length: 12 }, (_, i) => ({
  id: id(i + 1),
  title: `${labels[i % 8]} 포스터 피드 검증 공고 ${i + 1}`,
  organizer_name: i === 3 ? null : "실제 주관기관",
  source_org_name: "수집 포털 금지",
  thumbnail_url:
    i % 3 === 0
      ? `${origin}/storage/v1/object/public/posters/feed-test-${i}.png`
      : null,
  created_at: new Date().toISOString(),
  published_at: new Date().toISOString(),
  poster_status: "published",
  deadline_type: "fixed",
  application_end_at: new Date(Date.now() + 3 * 86400000).toISOString(),
}));

for (const width of [360, 390, 430, 768, 1280, 1440])
  test(`poster feed ${width}px: image states, geometry, prompt and favorite`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      (window as any).feedCLS = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any) {
          if (!entry.hadRecentInput) (window as any).feedCLS += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.pathname === "/_next/image") {
        if (url.searchParams.get("url")?.includes("feed-test-9"))
          return route.fulfill({ status: 404, body: "" });
        const banner = url.searchParams.get("url")?.includes("feed-test-6");
        return route.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="${banner ? 800 : 600}" height="${banner ? 600 : 1800}"><rect width="100%" height="100%" fill="#e4d9b9"/><text x="40" y="200" font-size="50">${banner ? "BANNER" : "POSTER"}</text></svg>`,
        });
      }
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({ contentType: "application/json", body: "{}" });
      if (!url.hostname.endsWith(".supabase.co")) return route.continue();
      const table = url.pathname.replace("/rest/v1/", "");
      let body: unknown = [];
      if (table === "rpc/search_public_posters" || table === "posters")
        body = rows;
      if (table === "categories")
        body = labels.map((name, i) => ({
          id: id(100 + i),
          name,
          code: codes[i],
        }));
      if (table === "poster_categories")
        body = rows.map((row, i) => ({
          poster_id: row.id,
          category_id: id(100 + (i % 8)),
          categories: { id: id(100 + (i % 8)), name: labels[i % 8] },
        }));
      if (table === "poster_images")
        body = rows
          .filter((r) => r.thumbnail_url)
          .map((r, i) => ({
            poster_id: r.id,
            storage_path: r.thumbnail_url,
            width: i === 1 ? 1600 : i === 2 ? 800 : 600,
            height: i === 1 || i === 2 ? 600 : 1800,
            image_status: i === 1 ? "unsuitable" : "ok",
          }));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/$/);
    const cards = page.locator("[data-feed-card]");
    await expect(cards).toHaveCount(8);
    const prompt = page.locator("[data-interest-prompt]");
    await expect(prompt).toBeVisible();
    expect(
      await prompt.evaluate(
        (el) =>
          el.previousElementSibling?.querySelector("[data-feed-card]") !== null,
      ),
    ).toBe(true);
    await expect(page.getByText(/방문 이후/)).toHaveCount(0);
    await expect(cards.getByText("수집 포털 금지")).toHaveCount(0);
    await expect(page.getByRole("complementary")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    expect(
      await page
        .locator(".feed-grid")
        .first()
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(width >= 1200 ? 4 : width >= 768 ? 3 : 2);
    const dimensions = await cards
      .first()
      .locator(".aspect-\\[3\\/4\\]")
      .boundingBox();
    expect(dimensions!.height / dimensions!.width).toBeCloseTo(4 / 3, 1);
    await expect(page.getByText("전체 보기").first()).toBeVisible();
    await expect(
      page.locator(`[data-feed-card="${id(4)}"] [data-default-poster]`),
    ).toBeVisible();
    expect(
      await page
        .locator(`[data-feed-card="${id(7)}"] img`)
        .evaluate((el) => getComputedStyle(el).objectFit),
    ).toBe("contain");
    expect(await page.locator("[data-default-poster]").count()).toBeGreaterThan(
      0,
    );
    const favorite = cards.first().getByRole("button", { name: "찜하기" });
    const box = await favorite.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await favorite.click();
    await expect(
      cards.first().getByRole("button", { name: "찜 취소" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "나중에 할게요" })
      .click();
    await page.getByRole("button", { name: "관심 분야 안내 닫기" }).click();
    await expect(prompt).toHaveCount(0);
    await page.reload({ waitUntil: "networkidle" });
    await expect(prompt).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as any).feedCLS),
    ).toBeLessThanOrEqual(0.1);
    mkdirSync("playwright-report/poster-feed", { recursive: true });
    await page.screenshot({
      path: `playwright-report/poster-feed/mixed-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button',{name:'더 보기',exact:true}).click();
    const brokenCard=page.locator(`[data-feed-card="${id(10)}"]`);
    await brokenCard.scrollIntoViewIfNeeded();
    await expect(brokenCard.locator('[data-default-poster]')).toBeVisible();
    const realId = await cards
      .filter({ has: page.locator("img") })
      .first()
      .getAttribute("data-feed-card");
    const realCard = page.locator(`[data-feed-card="${realId}"]`);
    await realCard
      .locator("img")
      .evaluate((img) => img.dispatchEvent(new Event("error")));
    await expect(realCard.locator("[data-default-poster]")).toBeVisible();
  });
