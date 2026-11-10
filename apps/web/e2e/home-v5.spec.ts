import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

// Home v5 (UI plan 3-4 C-0) against a local server started with
//   UI_SHOWCASE=1 HOME_FEED_FIXTURE=<abs path>/e2e/fixtures/home-v5.json
// so every section has data. Browser requests to Supabase are all answered
// here: writes and product events are recorded and never reach a database.
test.skip(
  process.env.E2E_HOME_FIXTURE !== "1",
  "needs a server started with UI_SHOWCASE=1 HOME_FEED_FIXTURE=e2e/fixtures/home-v5.json",
);

const envText = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const SUPABASE_URL =
  envText.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim() ?? "";
const REF = SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split(".")[0] : "x";
const fixture = JSON.parse(
  readFileSync("e2e/fixtures/home-v5.json", "utf8"),
) as {
  rows: Array<{ id: string; title: string; organizer_id: string | null }>;
  taxonomy: { regions: Array<{ id: string; name: string; level: string }> };
};
const MAPO_REGION = fixture.taxonomy.regions.find((r) => r.name === "마포구")!;
const USER = "eeeeeeee-0000-4000-8000-000000000001";
const byTitle = (title: string) =>
  fixture.rows.find((row) => row.title === title)!;
const WELFARE = byTitle("청년 마음건강 상담 지원 11월 신청");
const RUNMATE = byTitle("마포러닝메이트 참여자 모집");
const SHOTS = "playwright-report/home-v5";

type Event = {
  name: string;
  metadata: Record<string, unknown>;
  institution?: string | null;
};
let events: Event[] = [];
let writes: string[] = [];
test.beforeEach(() => {
  events = [];
  writes = [];
});

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  status: 200,
  contentType: "application/json",
  headers,
  body: JSON.stringify(body),
});

async function open(
  page: Page,
  width: number,
  { member = false, path = "/" } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === "/_next/image") {
      const src = url.searchParams.get("url") ?? "";
      if (src.includes("feed-test-1.png"))
        return route.fulfill({ status: 404, body: "" });
      const long = src.includes("feed-test-8.png");
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${long ? 1800 : 800}"><rect width="100%" height="100%" fill="#e4d9b9"/><text x="40" y="200" font-size="56" fill="#1c2d4f">POSTER</text></svg>`,
      });
    }
    if (!url.hostname.endsWith(".supabase.co")) {
      if (
        /sentry\.io|google-analytics|googletagmanager|vercel\.live/.test(
          url.hostname,
        )
      )
        return route.abort();
      return route.continue();
    }
    if (/\/auth\/v1\/user/.test(url.pathname))
      return member
        ? route.fulfill(
            json({ id: USER, aud: "authenticated", role: "authenticated" }),
          )
        : route.fulfill({ status: 401, body: "{}" });
    if (!url.pathname.startsWith("/rest/v1/")) return route.abort();
    const table = url.pathname.replace("/rest/v1/", "");
    const method = req.method();
    if (table === "rpc/record_product_event") {
      const body = JSON.parse(req.postData() || "{}");
      events.push({
        name: body.p_event_name,
        metadata: body.p_metadata ?? {},
        institution: body.p_institution_id,
      });
      return route.fulfill({ status: 204, body: "" });
    }
    if (method !== "GET" && method !== "HEAD") {
      writes.push(`${method} ${table}`);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "[]",
      });
    }
    const single = (req.headers()["accept"] ?? "").includes("pgrst.object");
    if (table === "profiles")
      return route.fulfill(
        json(
          single
            ? { primary_region_id: null, regions: null, role: "user" }
            : [],
        ),
      );
    if (table === "user_visit_state" || single)
      return route.fulfill(json(null));
    if (table === "regions")
      return route.fulfill(json(fixture.taxonomy.regions));
    if (table === "notifications")
      return route.fulfill({
        ...json([]),
        headers: { "content-range": "0-0/0" },
      });
    return route.fulfill(json([]));
  });
  if (member) {
    await page.addInitScript(
      ({ ref, user }) => {
        const session = {
          access_token: "fake",
          refresh_token: "fake",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: user,
            aud: "authenticated",
            role: "authenticated",
            email: "tester@example.com",
          },
        };
        const encoded = btoa(JSON.stringify(session))
          .split("+")
          .join("-")
          .split("/")
          .join("_")
          .split("=")
          .join("");
        document.cookie = `sb-${ref}-auth-token=base64-${encoded}; path=/`;
      },
      { ref: REF, user: USER },
    );
  }
  await page.goto(path, { waitUntil: "networkidle" });
}

const cardIds = (page: Page) =>
  page
    .locator("[data-feed-card]")
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.feedCard!),
    );

test("guest 390: v6.1 order, posters first, each poster once", async ({
  page,
}) => {
  await open(page, 390);
  const sections = await page
    .locator("[data-home-section]")
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.homeSection),
    );
  // v6.1 (SPEC 7.1): no rows above the feed; bundles stay between pages.
  expect(sections[0]).toBe("new");
  expect(sections).not.toContain("pick");
  expect(sections).not.toContain("deadline");
  await expect(page.locator("[data-interest-prompt]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^둘러보는 지역: 서울 전체/ }),
  ).toBeVisible();
  await expect(
    page.getByText(/^지원·강좌·행사 · 접수 중 \d+건$/),
  ).toBeVisible();
  const chips = page.getByRole("group", { name: "분야" }).getByRole("button");
  await expect(chips.first()).toHaveText("전체");
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  // First visit: no favourite line, no "지난 방문 이후".
  await expect(page.locator("[data-favorite-deadline-line]")).toHaveCount(0);
  await expect(page.getByText(/지난 방문 이후/)).toHaveCount(0);
  const firstPoster = (await page
    .locator("[data-home-grid] li")
    .first()
    .boundingBox())!;
  expect(firstPoster.y).toBeLessThan(200);
  const ids = await cardIds(page);
  expect(new Set(ids).size).toBe(ids.length);
  await expect(page.getByText("수집 포털", { exact: false })).toHaveCount(0);
});

test("chips: a field narrows the feed and 전체 brings it back", async ({
  page,
}) => {
  await open(page, 390);
  const firstGrid = () =>
    page
      .locator("[data-home-grid]")
      .first()
      .locator("[data-feed-card]")
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.feedCard!).join(","),
      );
  const before = await firstGrid();
  const chip = page
    .getByRole("group", { name: "분야" })
    .getByRole("button")
    .nth(1);
  const request = page.waitForRequest((req) =>
    /\/api\/home\?.*chip=/.test(req.url()),
  );
  await chip.click();
  await request;
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect.poll(firstGrid).not.toBe(before);
  await page
    .getByRole("group", { name: "분야" })
    .getByRole("button", { name: "전체" })
    .click();
  await expect.poll(firstGrid).toBe(before);
});

/** Loads feed pages until the card is on the page (v6.1 lists newest first). */
async function reveal(page: Page, id: string) {
  const card = page.locator(`[data-feed-card="${id}"]`).first();
  for (let i = 0; i < 8 && !(await card.count()); i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }
  await card.scrollIntoViewIfNeeded();
  return card;
}

for (const width of [360, 390, 430, 768, 1280, 1440])
  test(`home ${width}px: layout, rows, columns, no page overflow`, async ({
    page,
  }) => {
    await open(page, width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    const columns = await page
      .locator("[data-home-grid]")
      .first()
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(columns).toBe(width >= 1200 ? 4 : width >= 768 ? 3 : 2);
    // v6.1 card poster box is 5:7.
    const art = page.locator("[data-feed-card] .aspect-\\[5\\/7\\]").first();
    const box = (await art.boundingBox())!;
    expect(box.height / box.width).toBeCloseTo(7 / 5, 1);
    if (width === 1440) {
      // 1440×900: the first row's title and lines are on the first screen.
      const firstCard = (await page
        .locator("[data-home-grid] li")
        .first()
        .boundingBox())!;
      expect(firstCard.y + firstCard.height).toBeLessThanOrEqual(900);
    }
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: `${SHOTS}/home-${width}.png`,
      fullPage: true,
    });
  });

test("image states: banner and broken images fall back, tall posters fill from the top", async ({
  page,
}) => {
  await open(page, 390);
  const card = (n: number) =>
    reveal(page, `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`);
  await expect((await card(4)).locator("[data-default-poster]")).toBeVisible(); // wide banner
  await expect((await card(1)).locator("[data-default-poster]")).toBeVisible(); // 404 → default
  // v6.1 (SPEC 3): height ÷ width ≥ 1.2 → cover from the top (600×800, 600×1800).
  for (const n of [3, 8]) {
    const fit = await (await card(n)).locator("img").evaluate((img) => {
      const style = getComputedStyle(img);
      return `${style.objectFit} ${style.objectPosition}`;
    });
    expect(fit).toMatch(/^cover 50% 0%/);
  }
});

test("feed continues 600px before the end, keeps a 더 보기 link and restores on back", async ({
  page,
}) => {
  await open(page, 390);
  await expect(page.getByRole("link", { name: "더 보기" })).toHaveAttribute(
    "href",
    "/?page=2",
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator("[data-home-grid]")).toHaveCount(2);
  await expect(
    page.locator('[data-home-section="curated_youth_support"]'),
  ).toBeVisible();
  // v6.1 keeps every poster in the feed (no rows above it): more pages.
  // (The 더 보기 link is hidden while a page loads, so wait on the cards.)
  for (let i = 0; i < 10; i += 1) {
    if ((await cardIds(page)).length >= fixture.rows.length) break;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "더 보기" })).toHaveCount(0);
  const pageCount = await page.locator("[data-home-grid]").count();
  expect(pageCount).toBeGreaterThanOrEqual(3);
  const ids = await cardIds(page);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.length).toBe(fixture.rows.length);
  // Open a card from page 3, then come back: same pages, same place.
  const target = page
    .locator("[data-home-grid]")
    .nth(2)
    .locator("[data-feed-card] a")
    .first();
  await target.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  await target.click();
  await page.waitForURL(/\/posters\//);
  await page.goBack({ waitUntil: "networkidle" });
  // The saved pages come back (the feed may load one more below them).
  await expect
    .poll(() => page.locator("[data-home-grid]").count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(pageCount);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(y - 400);
  expect(
    events.some(
      (e) => e.name === "feed_card_click" && e.metadata.section_id === "new",
    ),
  ).toBe(true);
});

test("no-JS 더 보기: /?page=2 renders two feed pages on the server", async ({
  page,
}) => {
  await open(page, 1280, { path: "/?page=2" });
  await expect(page.locator("[data-home-grid]")).toHaveCount(2);
});

test("impressions: once per card, with section, position and image kind", async ({
  page,
}) => {
  await open(page, 1280);
  await expect
    .poll(
      () => events.filter((e) => e.name === "feed_card_impression").length,
      { timeout: 5000 },
    )
    .toBeGreaterThan(3);
  // Default-image posters sit further down in the v6.1 feed.
  await reveal(page, "aaaaaaaa-0000-4000-8000-000000000004");
  await page.waitForTimeout(1500);
  const shown = events.filter((e) => e.name === "feed_card_impression");
  expect(
    shown.every(
      (e) =>
        typeof e.metadata.section_id === "string" &&
        typeof e.metadata.position === "number",
    ),
  ).toBe(true);
  expect(new Set(shown.map((e) => e.metadata.image_kind))).toContain("default");
  const keys = shown.map(
    (e) => `${e.metadata.section_id}:${e.metadata.position}`,
  );
  expect(new Set(keys).size).toBe(keys.length);
});

test("guest follow prompt: after a 찜, organiser only, once per visit, then sign-in keeps prompt_id", async ({
  page,
}) => {
  await open(page, 390);
  const welfare = await reveal(page, WELFARE.id);
  await welfare.getByRole("button", { name: "찜하기" }).click();
  const prompt = page.getByRole("region", { name: "기관 팔로우 제안" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(
    "서울시복지재단의 새 공고도 모아 보시겠어요?",
  );
  await expect(prompt).toContainText("팔로우 기관 소식");
  await expect(prompt).not.toContainText("알림");
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/follow-guest-390.png` });
  const shown = events.find((e) => e.name === "follow_prompt_shown")!;
  expect(shown.metadata).toMatchObject({
    trigger: "favorite",
    logged_in: false,
    screen: "home",
  });
  expect(String(shown.metadata.prompt_id)).toMatch(/^fp_[a-z0-9]+$/);
  expect(shown.institution).toBe(WELFARE.organizer_id);

  await prompt.getByRole("button", { name: "기관 팔로우" }).click();
  await page.waitForURL(/\/login\?redirectTo=%2F/);
  const stored = await page.evaluate(() => ({
    action: JSON.parse(localStorage.getItem("pl.pending_action.v1") || "null"),
    intent: JSON.parse(localStorage.getItem("pl.signup_intent.v1") || "null"),
  }));
  expect(stored.action).toMatchObject({
    type: "follow",
    targetId: WELFARE.organizer_id,
    promptId: shown.metadata.prompt_id,
  });
  expect(stored.intent).toMatchObject({
    feature: "follow",
    promptId: shown.metadata.prompt_id,
  });
  expect(
    events.some(
      (e) =>
        e.name === "follow_prompt_click" &&
        e.metadata.prompt_id === shown.metadata.prompt_id,
    ),
  ).toBe(true);

  // Same visit, another organiser: no second prompt (guest save sheet instead).
  await page.goto("/", { waitUntil: "networkidle" });
  const runmate = await reveal(page, RUNMATE.id);
  await runmate.getByRole("button", { name: "찜하기" }).click();
  await expect(
    page.getByRole("dialog", { name: "찜한 공고를 계정에 보관할까요?" }),
  ).toBeVisible();
  await expect(prompt).toHaveCount(0);
  expect(events.filter((e) => e.name === "follow_prompt_shown")).toHaveLength(
    1,
  );
  expect(writes).toEqual([]);
});

test("guest follow prompt: 괜찮아요 is remembered for that institution", async ({
  page,
}) => {
  await open(page, 390);
  await (await reveal(page, WELFARE.id))
    .getByRole("button", { name: "찜하기" })
    .click();
  const prompt = page.getByRole("region", { name: "기관 팔로우 제안" });
  await prompt.getByRole("button", { name: "괜찮아요" }).click();
  await expect(prompt).toHaveCount(0);
  expect(events.some((e) => e.name === "follow_prompt_dismiss")).toBe(true);
  // New visit (new tab session): the refused institution is not offered again.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  const card = await reveal(page, WELFARE.id);
  await card.getByRole("button", { name: "찜 취소" }).click();
  await card.getByRole("button", { name: "찜하기" }).click();
  await expect(
    page.getByRole("dialog", { name: "찜한 공고를 계정에 보관할까요?" }),
  ).toBeVisible();
  await expect(prompt).toHaveCount(0);
});

test("member follow prompt: 찜 → 기관 팔로우 writes the follow with prompt_id", async ({
  page,
}) => {
  await open(page, 1280, { member: true });
  // Organiser 서울청년센터 마포; further down the v6.1 feed.
  await (await reveal(page, RUNMATE.id))
    .getByRole("button", { name: "찜하기" })
    .click();
  const prompt = page.getByRole("region", { name: "기관 팔로우 제안" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("찜했어요 · 내 공고에 담겼어요");
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/follow-member-1280.png` });
  await prompt.getByRole("button", { name: "기관 팔로우" }).click();
  await expect(prompt).toHaveCount(0);
  await expect(
    page.getByText("서울청년센터 마포 팔로우를 시작했어요"),
  ).toBeVisible();
  expect(writes).toEqual(
    expect.arrayContaining(["POST favorites", "POST institution_follows"]),
  );
  const promptId = events.find((e) => e.name === "follow_prompt_shown")!
    .metadata.prompt_id;
  expect(events.find((e) => e.name === "institution_follow")).toMatchObject({
    institution: RUNMATE.organizer_id,
    metadata: { prompt_id: promptId, screen: "home" },
  });
  expect(
    events.find((e) => e.name === "favorite_add")?.metadata.section_id,
  ).toMatch(/^(new|curated_)/); // v6.1: no 7일 안에 마감 row
});

for (const member of [false, true])
  test(`${member ? "member" : "guest"} 390: the region title picks a browsing region in place`, async ({
    page,
  }) => {
    const homeCalls: URLSearchParams[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname === "/api/home") homeCalls.push(url.searchParams);
    });
    await open(page, 390, { member });
    const title = page.getByRole("button", { name: /^둘러보는 지역: / });
    await expect(title).toContainText("서울 전체");
    await title.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toHaveAttribute("data-region-picker", "sheet");
    await sheet.getByRole("button", { name: /^서울/ }).first().click();
    await expect(
      sheet.getByRole("button", { name: "서울 전체" }),
    ).toHaveAttribute("aria-current", "true");
    await sheet.getByRole("button", { name: "마포구" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(title).toContainText("서울 마포구");
    await expect(title).toBeFocused();
    await expect
      .poll(() => homeCalls.map((call) => call.get("region")))
      .toContain(MAPO_REGION.id);
    await expect(
      page.getByText(/^지원·강좌·행사 · 접수 중 \d+건$/),
    ).toBeVisible();
    // Browsing never writes the profile or the guest's interest conditions.
    expect(writes).toEqual([]);
    expect(
      await page.evaluate(() => localStorage.getItem("pl.guest_interest.v1")),
    ).toBeNull();
    await page.reload({ waitUntil: "networkidle" });
    await expect(title).toContainText("서울 마포구");
  });

test("PC 1440: the region picker is a dropdown under the title", async ({
  page,
}) => {
  await open(page, 1440);
  const title = page.getByRole("button", { name: /^둘러보는 지역: / });
  await title.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toHaveAttribute("data-region-picker", "dropdown");
  await expect(panel.getByRole("button", { name: "서울" })).toBeVisible();
  const t = (await title.boundingBox())!;
  const d = (await panel.boundingBox())!;
  expect(d.y).toBeGreaterThanOrEqual(t.y + t.height);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(title).toBeFocused();
});
