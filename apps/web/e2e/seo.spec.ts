import { test, expect } from "@playwright/test";

test.describe("SEO / 공개 페이지", () => {
  test.beforeEach(async ({ page }) => {
    // UI regression checks must not persist analytics or other mutations.
    await page.route("**/api/**", (route) =>
      ["GET", "HEAD"].includes(route.request().method())
        ? route.continue()
        : route.abort(),
    );
  });
  test("홈 200 응답", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
  });

  test("홈 초기 HTML에 상위 지역·분야 링크 20개 포함", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBeLessThan(400);
    const html = await res.text();
    const combinationLinks = html.match(/href="\/regions\/[^"/]+\/[^"/]+"/g);
    expect(combinationLinks).toHaveLength(20);
    expect(html).toContain("지역별 공고 모아보기");
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
    for (const path of [
      "/regions/seoul-mapo",
      "/categories/course",
      "/regions/seoul-mapo/course",
    ]) {
      const res = await request.get(path);
      expect(res.status()).toBeLessThan(400);
      const html = await res.text();
      expect(html).toMatch(/href="\/posters\/[0-9a-f-]{36}"/);
    }
  });

  test("강서구 행사모집 실험 랜딩에 고유 SEO 본문과 공고 포함", async ({
    request,
  }) => {
    const res = await request.get("/regions/seoul-gangseo/event-recruit");
    expect(res.status()).toBeLessThan(400);
    const html = await res.text();
    expect(html).toContain("강서구 행사모집 모음");
    expect(html).toContain("지역 주민이 참여할 수 있는 문화행사");
    expect(html).toContain("함께 살펴볼 공고");
    expect(html).toMatch(/href="\/posters\/[0-9a-f-]{36}"/);
  });

  test("public institution list and details are crawlable", async ({
    request,
  }) => {
    const listRes = await request.get("/institutions");
    expect(listRes.status()).toBeLessThan(400);
    const listHtml = await listRes.text();
    const institutionPaths = [
      ...listHtml.matchAll(/href="(\/institutions\/[^"#?]+)"/g),
    ]
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

  test("anonymous home summary is server-rendered", async ({ request }) => {
    const summary = await (await request.get("/api/home/summary")).json();
    expect(summary.activePosters).toBeGreaterThan(0);
    const html = await (await request.get("/")).text();
    expect(html).toContain(summary.activePosters.toLocaleString());
    expect(html).not.toContain("신청 가능한 공고 0건");
  });

  test("sitemap index exposes paginated public poster URLs", async ({
    request,
  }) => {
    const response = await request.get("/sitemap-index.xml");
    expect(response.status()).toBe(200);
    const index = await response.text();
    expect(index).toContain("<sitemapindex");
    const shards = [
      ...index.matchAll(/<loc>([^<]+\/sitemaps\/posters\/\d+\.xml)<\/loc>/g),
    ];
    expect(shards.length).toBeGreaterThan(0);
    const urls = new Set<string>();
    for (const [, url] of shards) {
      const shard = await request.get(new URL(url).pathname);
      expect(shard.status()).toBe(200);
      const entries = [
        ...(await shard.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
      ];
      expect(entries.length).toBeLessThanOrEqual(1000);
      for (const [, entry] of entries) {
        expect(urls.has(entry)).toBe(false);
        urls.add(entry);
      }
    }
    expect(urls.size).toBeGreaterThan(500);
    expect((await request.get("/sitemaps/posters/invalid.xml")).status()).toBe(
      404,
    );
  });

  test("detail HTML has matching canonical, Twitter metadata and valid JSON-LD", async ({
    request,
  }) => {
    const list = await (await request.get("/posters")).text();
    const path = list.match(/href="(\/posters\/[0-9a-f-]{36})"/)?.[1];
    expect(path).toBeTruthy();
    const response = await request.get(path!);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    expect(new URL(canonical!).pathname).toBe(path);
    expect(new URL(canonical!).search).toBe("");
    expect(html).toContain(`property="og:url" content="${canonical}"`);
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain("원문 출처");
    expect(html).toContain("정보 확인");
    const json = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ];
    expect(json.length).toBeGreaterThan(0);
    for (const [, value] of json) expect(() => JSON.parse(value)).not.toThrow();
  });
});
