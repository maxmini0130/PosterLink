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

  test("포스터 목록 초기 HTML에 실제 공고 링크 포함", async ({ request }) => {
    const res = await request.get("/posters");
    expect(res.status()).toBeLessThan(400);
    const html = await res.text();
    expect(html).toMatch(/href="\/posters\/[0-9a-f-]{36}"/);
    expect(html).not.toContain("검색 결과가 없습니다.");
  });

  test("지역·분야 랜딩 초기 HTML에 공고 포함", async ({ request }) => {
    for (const path of ["/regions/seoul-mapo", "/categories/course", "/regions/seoul-mapo/course"]) {
      const res = await request.get(path);
      expect(res.status()).toBeLessThan(400);
      const html = await res.text();
      expect(html).toMatch(/href="\/posters\/[0-9a-f-]{36}"/);
    }
  });

  test("기관 목록과 기관 상세 공개", async ({ request }) => {
    const listRes = await request.get("/institutions");
    expect(listRes.status()).toBeLessThan(400);
    expect(await listRes.text()).toContain("/institutions/mapo-gu");

    const detailRes = await request.get("/institutions/mapo-gu");
    expect(detailRes.status()).toBeLessThan(400);
    const detailHtml = await detailRes.text();
    expect(detailHtml).toContain("이 기관에서 게시·수집한 공고");
    expect(detailHtml).toMatch(/href="\/posters\/[0-9a-f-]{36}"/);
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
