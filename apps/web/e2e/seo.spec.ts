import { test, expect } from "@playwright/test";

test.describe("SEO / 공개 페이지", () => {
  test("홈 200 응답", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
  });

  test("포스터 목록 200 응답", async ({ page }) => {
    const res = await page.goto("/posters");
    expect(res?.status()).toBeLessThan(400);
  });

  test("이용약관 200 응답", async ({ page }) => {
    const res = await page.goto("/terms");
    expect(res?.status()).toBeLessThan(400);
  });

  test("개인정보처리방침 200 응답", async ({ page }) => {
    const res = await page.goto("/privacy");
    expect(res?.status()).toBeLessThan(400);
  });

  test("robots.txt - /admin/ 차단 포함", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBeLessThan(400);
    const text = await res.text();
    expect(text).toContain("Disallow");
    expect(text).toMatch(/Disallow:\s*\/admin/);
  });

  test("sitemap.xml - urlset 반환", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBeLessThan(400);
    const text = await res.text();
    expect(text).toContain("urlset");
  });
});
