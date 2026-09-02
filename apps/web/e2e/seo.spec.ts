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

  test("public institution list and details are crawlable", async ({ request }) => {
    const listRes = await request.get("/institutions");
    expect(listRes.status()).toBeLessThan(400);
    const listHtml = await listRes.text();
    const institutionPaths = [...listHtml.matchAll(/href="(\/institutions\/[^"#?]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== "/institutions");
    expect(institutionPaths.length).toBeGreaterThan(0);

    const detailRes = await request.get(institutionPaths[0]);
    expect(detailRes.status()).toBeLessThan(400);
    const detailHtml = await detailRes.text();
    expect(detailHtml).toContain("<main");

    let detailWithPoster = detailHtml;
    for (const path of institutionPaths.slice(1, 20)) {
      if (/href="\/posters\/[0-9a-f-]{36}"/.test(detailWithPoster)) break;
      const nextDetailRes = await request.get(path);
      if (nextDetailRes.status() >= 400) continue;
      detailWithPoster = await nextDetailRes.text();
    }
    expect(detailWithPoster).toMatch(/href="\/posters\/[0-9a-f-]{36}"/);
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
