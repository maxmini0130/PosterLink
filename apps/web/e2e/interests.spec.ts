import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// 관심 지역·분야 고르기 (UI redesign ⑤) and the full guest-to-member flow on a
// phone, against the local server (playwright.ui-components.config.ts).
// Regions, categories, interest posters and account data are fixtures in the
// browser; every write gets a fake response and never reaches the database.
// The real poster detail and poster rows are public reads with the public key.
// Sign-in itself (the Kakao redirect) is replaced by setting the session
// cookie it would leave; the real redirect is checked on staging.
const REF = process.env.E2E_SUPABASE_REF ?? "";
test.skip(!REF, "set E2E_SUPABASE_REF to the project ref");
const envText = (() => {
  try {
    return readFileSync(".env.local", "utf8").replace(/^﻿/, "");
  } catch {
    return "";
  }
})();
const ANON =
  (envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/) ?? [])[1]
    ?.trim()
    .replace(/^"|"$/g, "") ?? "";
const OPEN =
  process.env.E2E_DETAIL_POSTER_ID ?? "114a869d-fdb4-4ec2-a732-6a2b5804037e";
const USER = "00000000-0000-4000-8000-000000000001";

const SEOUL = "5e000000-0000-4000-8000-000000000001";
const MAPO = "5e000000-0000-4000-8000-000000000002";
const EUNPYEONG = "5e000000-0000-4000-8000-000000000003";
const REGIONS = [
  {
    id: SEOUL,
    name: "서울",
    full_name: "서울특별시",
    level: "sido",
    parent_id: null,
  },
  {
    id: MAPO,
    name: "마포구",
    full_name: "서울특별시 마포구",
    level: "sigungu",
    parent_id: SEOUL,
  },
  {
    id: EUNPYEONG,
    name: "은평구",
    full_name: "서울특별시 은평구",
    level: "sigungu",
    parent_id: SEOUL,
  },
];
const WELFARE = "ca000000-0000-4000-8000-000000000001";
const EDU = "ca000000-0000-4000-8000-000000000002";
const CULTURE = "ca000000-0000-4000-8000-000000000003";
const CATEGORIES = [
  { id: WELFARE, name: "지원금/복지" },
  { id: EDU, name: "교육/취업" },
  { id: CULTURE, name: "문화/행사" },
];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const iso = (time: number) => new Date(time).toISOString();
const posterRow = (n: number, title: string, publishedDaysAgo: number) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title,
  source_org_name: "샘플 기관",
  organizer_name: null,
  verification_status: null,
  verified_at: null,
  application_start_at: null,
  application_end_at: iso(NOW + 20 * DAY),
  deadline_type: "fixed",
  thumbnail_url: null,
  source_key: null,
  created_at: iso(NOW - publishedDaysAgo * DAY),
  published_at: iso(NOW - publishedDaysAgo * DAY),
  poster_status: "published",
  source_institution_id: null,
  organizer_id: null,
});
const INTEREST = [
  posterRow(1, "마포구 문화 새 공고", 1),
  posterRow(2, "마포구 교육 새 공고", 2),
  posterRow(3, "지난달 올라온 마포구 공고", 40),
];

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  status: 200,
  contentType: "application/json",
  headers,
  body: JSON.stringify(body),
});

let writes: string[] = [];
let searchCalls: Array<Record<string, unknown>> = [];
let signedIn = false;
let account = new Set<string>();
test.beforeEach(() => {
  writes = [];
  searchCalls = [];
  signedIn = false;
  account = new Set();
});

const sessionValue = () =>
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: "fake",
      refresh_token: "fake",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: USER,
        aud: "authenticated",
        role: "authenticated",
        email: "tester@example.com",
      },
    }),
  ).toString("base64url");

/** What the Kakao return leaves behind: the session cookie. */
async function signIn(page: Page) {
  signedIn = true;
  await page.context().addCookies([
    {
      name: `sb-${REF}-auth-token`,
      value: sessionValue(),
      url: page.url(),
    },
  ]);
}

async function mock(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (
      method === "GET" &&
      /\/api\/image-proxy|\/storage\/v1\/object\/public\//.test(url)
    )
      return route.continue();
    if (/\/auth\/v1\/user/.test(url))
      return signedIn
        ? route.fulfill(
            json({ id: USER, aud: "authenticated", role: "authenticated" }),
          )
        : route.fulfill({ status: 401, body: "{}" });
    if (!/supabase\.co\/rest\/v1\//.test(url))
      return /supabase\.co|\/api\/|sentry\.io/.test(url)
        ? route.abort()
        : route.continue();
    const u = new URL(url);
    const table = u.pathname.replace("/rest/v1/", "");
    if (table === "rpc/search_public_posters") {
      searchCalls.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill(json(INTEREST));
    }
    if (method !== "GET" && method !== "HEAD") {
      writes.push(`${method} ${u.pathname}`);
      if (table === "favorites" && method === "POST")
        for (const row of [JSON.parse(req.postData() || "[]")].flat())
          account.add(row.poster_id);
      return route.fulfill({ status: 201, body: "" });
    }
    const single = (req.headers()["accept"] ?? "").includes("pgrst.object");
    if (table === "regions") {
      const id = u.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = id ? REGIONS.filter((r) => r.id === id) : REGIONS;
      return route.fulfill(json(single ? (rows[0] ?? null) : rows));
    }
    if (table === "categories") {
      const ids = u.searchParams.get("id");
      return route.fulfill(
        json(CATEGORIES.filter((c) => !ids || ids.includes(c.id))),
      );
    }
    if (signedIn) {
      if (table === "favorites") {
        const ids = u.searchParams.get("poster_id");
        return route.fulfill(
          json(
            [...account]
              .filter((id) => !ids || ids.includes(id))
              .map((poster_id) => ({ poster_id, user_status: "interested" })),
          ),
        );
      }
      if (table === "profiles")
        return route.fulfill(
          json({
            role: "user",
            primary_region_id: MAPO,
            regions: REGIONS[1],
          }),
        );
      if (table === "user_interest_categories")
        return route.fulfill(
          json([{ category_id: CULTURE, categories: CATEGORIES[2] }]),
        );
      if (table === "institution_follows") return route.fulfill(json([]));
      if (table === "user_visit_state")
        // The member's last visit, 10 days ago, kept on the server.
        return route.fulfill(
          json({
            visit_started_at: iso(NOW - 10 * DAY - 60 * 60 * 1000),
            last_active_at: iso(NOW - 10 * DAY),
            baseline_at: null,
          }),
        );
      if (table === "notifications")
        return route.fulfill(json([], { "content-range": "0-0/0" }));
    }
    if (/^(posters|poster_categories|poster_regions)$/.test(table))
      return route.continue({
        headers: { ...req.headers(), authorization: `Bearer ${ANON}` },
      }); // public reads with the public key, never the fake session
    return route.abort();
  });
}

const stored = (page: Page, key: string) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), key);

test("⑤ opening the home directly for the first time asks for conditions first", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/interests$/);
  await expect(
    page.getByRole("heading", { name: "어느 동네의 어떤 공고를 찾고 계세요?" }),
  ).toBeVisible();
  await expect(page.getByText("가입 없이 이 기기에 저장돼요.")).toBeVisible();

  await page.getByRole("button", { name: "지역 고르기" }).click();
  await expect(page.getByLabel("시·도")).toHaveValue(SEOUL);
  await page.getByRole("button", { name: "마포구" }).click();
  await expect(page.getByText("서울 마포구", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "지역 바꾸기" })).toBeVisible();

  const all = page.getByRole("button", { name: "전체 분야" });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "문화/행사" }).click();
  await page.getByRole("button", { name: "교육/취업" }).click();
  await expect(page.getByRole("button", { name: "문화/행사" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(all).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "마포구 공고 보기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("마포구 · 관심 분야 2")).toBeVisible();
  await expect(page.getByRole("link", { name: "조건 변경" })).toHaveAttribute(
    "href",
    "/interests",
  );
  // The home asks in each chosen category for my area (마포구) and, apart,
  // for the areas above it (서울), so newer 서울 posters never push 마포구 out;
  // other districts of 서울 in the same categories; and the newest posters.
  await expect
    .poll(() =>
      searchCalls.map((call) => [call.p_region_ids, call.p_category_id]),
    )
    .toEqual(
      expect.arrayContaining([
        [[MAPO], CULTURE],
        [[MAPO], EDU],
        [[SEOUL], CULTURE],
        [[SEOUL], EDU],
        [[EUNPYEONG], CULTURE],
        [[EUNPYEONG], EDU],
        [null, null],
      ]),
    );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "마포구의 새로운 기회",
  );
  await expect(
    page.getByRole("region", { name: "마포구 접수 중 관심 공고" }),
  ).toBeVisible();
  expect(await stored(page, "pl.guest_interest.v1")).toMatchObject({
    v: 1,
    regionId: MAPO,
    categoryIds: [CULTURE, EDU],
  });
  // Opened once by itself; a reload stays on the home.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/$/);
  expect(writes.every((write) => !write.includes("profiles"))).toBe(true);
});

test("⑤ 건너뛰기 goes home, and the picker never opens by itself again", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/interests$/);
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("관심 지역·분야를 고르면 맞는 공고를 먼저 보여드려요."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "조건 고르기" })).toHaveAttribute(
    "href",
    "/interests",
  );
  expect(await stored(page, "pl.guest_interest.v1")).toBeNull();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/$/);
});

test("⑤ a search result or shared link is shown first; the home only suggests", async ({
  page,
}) => {
  await mock(page);
  // Arriving from another site (search engine, messenger link).
  await page.goto("/", {
    waitUntil: "networkidle",
    referer: "https://search.example/",
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("관심 지역·분야를 고르면 맞는 공고를 먼저 보여드려요."),
  ).toBeVisible();

  // A new tab opened on a shared poster. The detail's 찜·신청 bar replaces
  // the tab bar (screen plan v1.0, 06); 뒤로 가기 on a detail opened first in
  // this tab goes to the home, never out of the site.
  const shared = await page.context().newPage();
  await mock(shared);
  await shared.goto(`/posters/${OPEN}`, { waitUntil: "networkidle" });
  await expect(
    shared.getByRole("navigation", { name: "주요 탐색" }),
  ).toBeHidden();
  await expect(shared.getByRole("group", { name: "공고 행동" })).toBeVisible();
  await shared.getByRole("button", { name: "뒤로 가기" }).click();
  await expect(shared).toHaveURL(/\/$/);
  await expect(
    shared.getByText("관심 지역·분야를 고르면 맞는 공고를 먼저 보여드려요."),
  ).toBeVisible();
  await shared.getByRole("link", { name: "조건 고르기" }).click();
  await expect(shared).toHaveURL(/\/interests$/);
});

test("뒤로 가기 on a detail opened again from a search returns to the search", async ({
  page,
}) => {
  // Codex review P2-5: shared detail → search → the same detail. The detail
  // is still the tab's first page, but the entry before it is the search.
  await mock(page);
  await page.goto(`/posters/${OPEN}`, { waitUntil: "networkidle" });
  await page.goto("/posters?q=review-navigation", { waitUntil: "networkidle" });
  // Typed in the address bar (no referrer).
  await page.goto(`/posters/${OPEN}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "뒤로 가기" }).click();
  await expect(page).toHaveURL(/\/posters\?q=review-navigation$/);
  // Followed from a page of the site (referrer).
  await page.goto(`/posters/${OPEN}`, {
    waitUntil: "networkidle",
    referer: page.url(),
  });
  await page.getByRole("button", { name: "뒤로 가기" }).click();
  await expect(page).toHaveURL(/\/posters\?q=review-navigation$/);

  // The browser's back to the tab's first page, then 뒤로 가기: before it is
  // only the outside of the site, so the home.
  await page.goBack({ waitUntil: "networkidle" });
  await expect(page).toHaveURL(new RegExp(`/posters/${OPEN}$`));
  await page.getByRole("button", { name: "뒤로 가기" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("⑤ a member opening the picker goes to the account's conditions", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/terms", { waitUntil: "domcontentloaded" });
  await signIn(page);
  await page.goto("/interests", { waitUntil: "networkidle" });
  // /mypage/edit (or the sign-in page, since the fake session is not valid on
  // the server): never the guest picker.
  await expect(page).not.toHaveURL(/\/interests/);
});

test("full flow on a phone: guest 찜 → later → 내 공고 → sign-in → merged → home since last visit", async ({
  page,
}) => {
  await mock(page);
  // A shared link: the poster comes first, no picker.
  await page.goto(`/posters/${OPEN}`, { waitUntil: "networkidle" });
  await page
    .locator(".pl-action-bar")
    .getByRole("button", { name: /찜/ })
    .click();
  const toast = page
    .getByRole("status")
    .filter({ hasText: "이 기기에 저장됐어요" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "계정에 보관하기" }).click();
  const sheet = page.getByRole("dialog", {
    name: "찜한 공고를 계정에 보관할까요?",
  });
  await expect(sheet).toBeVisible();
  // No conditions yet: the sheet offers choosing them without signing up.
  await expect(
    sheet.getByRole("link", { name: "가입 전에 관심 지역·분야만 먼저 고르기" }),
  ).toHaveAttribute(
    "href",
    `/interests?next=${encodeURIComponent(`/posters/${OPEN}`)}`,
  );
  await sheet.getByRole("button", { name: "나중에 할게요" }).click();
  await expect(sheet).toBeHidden();

  // Back from the detail opened by a shared link: the home, then 내 공고.
  await page.getByRole("button", { name: "뒤로 가기" }).click();
  await page
    .getByRole("navigation", { name: "주요 탐색" })
    .getByRole("link", { name: "내 공고" })
    .click();
  await expect(
    page.getByRole("heading", { name: "이 기기에 찜한 공고 1개" }),
  ).toBeVisible();

  // Kakao sign-in returns with a session (mocked), back on 내 공고.
  await signIn(page);
  await page.goto("/my-posters", { waitUntil: "networkidle" });
  await expect(
    page.getByText("이 기기에 찜한 공고 1개를 계정으로 옮겼어요"),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /^찜 1/ })).toBeVisible();
  expect(
    writes.filter((write) => write === "POST /rest/v1/favorites"),
  ).toHaveLength(1);
  expect(account.has(OPEN)).toBe(true);
  expect(
    (await stored(page, "pl.guest_favorites.v1"))?.items ?? [],
  ).toHaveLength(0);

  await page
    .getByRole("navigation", { name: "주요 탐색" })
    .getByRole("link", { name: "홈" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "지난 방문 이후 새 관심 공고 2건",
  );
  await expect(page.getByText(/방문 이후/).first()).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "새로 올라온 관심 공고" })
      .getByRole("heading", { level: 3 }),
  ).toHaveText(["마포구 문화 새 공고", "마포구 교육 새 공고"]);
});
