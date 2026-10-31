import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./helpers/posterFixtures";

const slugs = [
  "welfare",
  "education",
  "culture",
  "housing",
  "business",
  "family",
  "health",
  "other",
  "support-program",
  "recruitment",
  "contest",
  "course",
  "event-recruit",
  "bid",
  "policy-info",
  "press-release",
  "life-info",
];
loadLocalEnv();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  { auth: { persistSession: false } },
);
function canonicalOrigin(baseURL?: string) {
  return (
    process.env.E2E_CANONICAL_ORIGIN ||
    (baseURL?.startsWith("http://localhost")
      ? new URL(baseURL).origin
      : "https://www.posterlink.kr")
  );
}
let categories: Array<{ id: string; code: string }>;
test.beforeAll(async () => {
  const { data, error } = await supabase
    .from("categories")
    .select("id,code")
    .eq("is_active", true);
  expect(error).toBeNull();
  categories = data!;
});
test.beforeEach(async ({ context }) => {
  // Preview feedback is not part of the application; never persist test analytics.
  await context.route("https://vercel.live/**", (route) => route.abort());
  await context.route("**/api/**", (route) =>
    ["GET", "HEAD"].includes(route.request().method())
      ? route.continue()
      : route.abort(),
  );
});

for (const slug of slugs) {
  test(`${slug}: active count, SSR links and canonical remain consistent`, async ({
    page,
    request,
    baseURL,
  }) => {
    const category = categories.find(
      (row) => row.code === `CAT_${slug.toUpperCase().replaceAll("-", "_")}`,
    )!;
    expect(category).toBeTruthy();
    const { data: count, error } = await supabase.rpc("count_public_posters", {
      p_query: null,
      p_category_id: category.id,
      p_region_ids: null,
      p_include_closed: false,
    });
    expect(error).toBeNull();
    const response = await request.get(`/categories/${slug}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    await page.goto(`/categories/${slug}`);
    await expect(page.locator("#landing-results-title")).toHaveText(
      `${Number(count).toLocaleString()}건`,
    );
    await expect(
      page.getByText("현재 모집 중 공고", { exact: true }),
    ).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${canonicalOrigin(baseURL)}/categories/${slug}`,
    );
    const robots = page.locator('meta[name="robots"]');
    expect(
      (await robots.count()) ? await robots.getAttribute("content") : "",
    ).not.toContain("noindex");
    const links = await page
      .locator('main a[href^="/posters/"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")),
      );
    for (const link of links) expect(html).toContain(`href="${link}"`);
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const collection = scripts
      .map((text) => JSON.parse(text))
      .find((data) => data["@type"] === "CollectionPage");
    expect(collection).toBeTruthy();
    for (const item of collection.mainEntity.itemListElement)
      expect(links).toContain(new URL(item.url).pathname);
  });
}

test("bid archive is linked and explicitly closed even when active count is zero", async ({
  page,
}) => {
  await page.goto("/categories/bid");
  const archive = page.locator("#category-closed");
  await expect(archive).toBeVisible();
  await expect(
    archive.getByText("신청 마감", { exact: true }).first(),
  ).toBeVisible();
  await expect(archive.locator('a[href^="/posters/"]').first()).toBeVisible();
  await expect(
    archive.getByRole("link", { name: "마감 포함 전체 검색" }),
  ).toHaveAttribute("href", /closed=include/);
  await expect(archive.getByText("상시 모집", { exact: true })).toHaveCount(0);
});

test("press releases without application dates remain information, not ongoing recruitment", async ({
  page,
}) => {
  await page.goto("/categories/press-release");
  const information = page.locator("#category-information");
  await expect(information).toBeVisible();
  await expect(
    information.getByText("정보 안내", { exact: true }).first(),
  ).toBeVisible();
  await expect(information.getByText("상시 모집", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    information.locator('a[href^="/posters/"]').first(),
  ).toBeVisible();
  await expect(information.locator("img")).toHaveCount(0);
  await page.goto("/categories/course");
  await expect(page.locator("#category-information")).toHaveCount(0);
});

test("categories with archives remain in sitemap and private notices stay blocked", async ({
  request,
  baseURL,
}) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const slug of slugs)
    expect(sitemap).toContain(
      `<loc>${canonicalOrigin(baseURL)}/categories/${slug}</loc>`,
    );
  for (const id of [
    "63952b5b-2c98-42f1-8be4-acb7ee1dede2",
    "70040810-4f9b-42e4-b2dd-fbf40ef41e73",
  ]) {
    expect((await request.get(`/posters/${id}`)).status()).toBe(404);
  }
});
