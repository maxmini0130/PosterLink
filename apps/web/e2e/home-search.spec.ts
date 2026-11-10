import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Home ⑥⑦⑧ and search ⑪ against the local server
// (playwright.ui-components.config.ts). Poster lists come from fixtures so each
// home state is reproducible; account data is mocked in the browser; every
// write gets a fake response and never reaches the database. Public reads that
// are not mocked use the public key. Needs E2E_SUPABASE_REF and .env.local.
const REF = process.env.E2E_SUPABASE_REF ?? "";
test.skip(!REF, "set E2E_SUPABASE_REF to the project ref");
const envText = (() => {
  try {
    return readFileSync(".env.local", "utf8").replace(/^﻿/, "");
  } catch {
    return "";
  }
})();
const env = (name: string) =>
  (envText.match(new RegExp(`^${name}=(.*)$`, "m")) ?? [])[1]
    ?.trim()
    .replace(/^"|"$/g, "") ?? "";
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const USER = "00000000-0000-4000-8000-000000000001";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (time: number) => new Date(time).toISOString();
const id = (n: number) =>
  `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Row = Record<string, unknown>;
function poster(n: number, title: string, extra: Row): Row {
  return {
    id: id(n),
    title,
    source_org_name: "샘플 기관",
    organizer_name: null,
    verification_status: null,
    verified_at: null,
    application_start_at: null,
    application_end_at: null,
    deadline_type: "fixed",
    thumbnail_url: null,
    source_key: null,
    created_at: iso(NOW - 60 * DAY),
    published_at: iso(NOW - 60 * DAY),
    poster_status: "published",
    source_institution_id: null,
    organizer_id: null,
    exposure_tier: null,
    ...extra,
  };
}

// Interest posters (the search RPC) and account-only posters.
const SOON = poster(1, "닷새 남은 새 공고", {
  published_at: iso(NOW - 1 * DAY),
  application_end_at: iso(NOW + 3 * DAY),
});
const ONGOING = poster(2, "상시 모집 새 공고", {
  published_at: iso(NOW - 2 * DAY),
  deadline_type: "ongoing",
});
const OLDER = poster(3, "지난달 올라온 공고", {
  published_at: iso(NOW - 20 * DAY),
  application_end_at: iso(NOW + 20 * DAY),
});
const STARTED = poster(4, "어제부터 접수하는 찜한 공고", {
  application_start_at: iso(NOW - 1 * DAY),
  application_end_at: iso(NOW + 20 * DAY),
});
const FOLLOWED = poster(5, "구독 기관의 새 공고", {
  published_at: iso(NOW - 1 * DAY),
  application_end_at: iso(NOW + 15 * DAY),
  source_institution_id: "77777777-7777-4777-8777-777777777777",
});
const INTEREST = [SOON, ONGOING, OLDER];
const ALL = [...INTEREST, STARTED, FOLLOWED];

let writes: string[] = [];
test.beforeEach(() => {
  writes = [];
});
const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

type Visit = {
  visitStartedAt: number;
  lastActiveAt: number;
  baselineAt: number | null;
};

async function open(
  page: Page,
  path: string,
  width: number,
  {
    member = false,
    visit = null as Visit | null,
    serverVisit = null as Visit | null,
    guestFavorites = [] as string[],
    searchRows = null as Row[] | null,
    regionLinks = {} as Record<string, string[]>,
  } = {},
) {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (!/supabase\.co\/rest\/v1\//.test(url)) {
      if (member && /\/auth\/v1\/user/.test(url))
        return route.fulfill(
          json({ id: USER, aud: "authenticated", role: "authenticated" }),
        );
      if (/supabase\.co|\/api\/|sentry\.io/.test(url)) return route.abort();
      return route.continue();
    }
    const u = new URL(url);
    const table = u.pathname.replace("/rest/v1/", "");
    if (table === "rpc/search_public_posters")
      return route.fulfill(json(searchRows ?? INTEREST));
    if (table === "rpc/count_public_posters")
      return route.fulfill(json((searchRows ?? INTEREST).length));
    if (method !== "GET" && method !== "HEAD") {
      writes.push(`${method} ${u.pathname}`);
      return route.fulfill({ status: 201, body: "" });
    }
    const fixtureIds = ALL.map((row) => row.id as string).concat(
      (searchRows ?? []).map((row) => row.id as string),
    );
    const mentions = (ids: string[]) => ids.filter((x) => url.includes(x));
    if (table === "posters") {
      if (
        u.searchParams
          .getAll("or")
          .some((value) => value.includes("source_institution_id"))
      )
        return route.fulfill(json(member ? [FOLLOWED] : []));
      const wanted = mentions(fixtureIds);
      if (wanted.length)
        return route.fulfill(
          json(
            [...ALL, ...(searchRows ?? [])].filter((row) =>
              wanted.includes(row.id as string),
            ),
          ),
        );
    }
    if (table === "poster_regions" && mentions(fixtureIds).length)
      return route.fulfill(
        json(
          Object.entries(regionLinks).flatMap(([posterId, regionIds]) =>
            regionIds.map((region_id) => ({ poster_id: posterId, region_id })),
          ),
        ),
      );
    if (member) {
      if (table === "profiles")
        return route.fulfill(
          json({
            primary_region_id: "r-mapo",
            role: "user",
            regions: {
              id: "r-mapo",
              name: "마포구",
              full_name: "서울특별시 마포구",
              level: "sigungu",
            },
          }),
        );
      if (table === "user_interest_categories")
        return route.fulfill(
          json([
            { category_id: "c1", categories: { id: "c1", name: "문화/행사" } },
            { category_id: "c2", categories: { id: "c2", name: "교육/취업" } },
          ]),
        );
      if (table === "favorites")
        return route.fulfill(json([{ poster_id: STARTED.id }]));
      if (table === "institution_follows")
        return route.fulfill(
          json([
            {
              institution_id: FOLLOWED.source_institution_id,
              institutions: {
                id: FOLLOWED.source_institution_id,
                name: "마포문화재단",
                slug: "bizinfo",
              },
            },
          ]),
        );
      if (table === "user_visit_state")
        return route.fulfill(
          json(
            serverVisit
              ? {
                  visit_started_at: iso(serverVisit.visitStartedAt),
                  last_active_at: iso(serverVisit.lastActiveAt),
                  baseline_at: serverVisit.baselineAt
                    ? iso(serverVisit.baselineAt)
                    : null,
                }
              : null,
          ),
        );
      if (table === "notifications")
        return route.fulfill({
          ...json([]),
          headers: { "content-range": "0-0/0" },
        });
    }
    // Other public reads with the public key, never a fake session.
    return route.continue({
      headers: { ...req.headers(), authorization: `Bearer ${ANON}` },
    });
  });
  await page.addInitScript(
    ({ member, visit, guestFavorites, ref, user }) => {
      // Seed once per tab so a reload keeps what the app wrote.
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      // These checks are about the home itself: the picker that opens on a
      // first direct visit (interests.spec.ts) is marked as already offered.
      localStorage.setItem(
        "pl.interest_offered.v1",
        JSON.stringify({ v: 1, at: 1 }),
      );
      if (visit)
        localStorage.setItem(
          member ? `pl.visit.v1:${user}` : "pl.visit.v1",
          JSON.stringify(visit),
        );
      if (guestFavorites.length)
        localStorage.setItem(
          "pl.guest_favorites.v1",
          JSON.stringify({
            v: 1,
            items: guestFavorites.map((posterId, i) => ({
              posterId,
              savedAt: i,
            })),
          }),
        );
      if (member) {
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
      }
    },
    { member, visit, guestFavorites, ref: REF, user: USER },
  );
  await page.goto(path, { waitUntil: "networkidle" });
}

const visitDate = (time: number) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}월 ${parts.day}일(${parts.weekday}) 방문 이후`;
};

// The home's own checks (sections, rows, columns, member conditions) moved to
// e2e/home-v5.spec.ts with the home v5 layout (UI plan 3-4 C-0).

test("search ⑪ keeps 서울·전국 posters apart with labels, and saves a condition", async ({
  page,
}) => {
  const regions = (await (
    await page.request.get(
      `${SUPABASE_URL}/rest/v1/regions?select=id,name,level&name=in.(마포구,서울특별시,전국)&level=in.(nation,sido,sigungu)`,
      { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } },
    )
  ).json()) as Array<{ id: string; name: string; level: string }>;
  const find = (name: string) =>
    regions.find((region) => region.name === name)?.id ?? "";
  const mapo = find("마포구");
  test.skip(!mapo || !find("서울특별시"), "regions not readable");
  const rows = [
    poster(11, "마포구 대상 공고", { application_end_at: iso(NOW + 9 * DAY) }),
    poster(12, "서울 전체 대상 공고", {
      application_end_at: iso(NOW + 9 * DAY),
    }),
    poster(13, "전국 대상 공고", { deadline_type: "ongoing" }),
  ];
  await open(page, `/posters?region=${mapo}`, 390, {
    searchRows: rows,
    regionLinks: {
      [rows[0].id as string]: [mapo],
      [rows[1].id as string]: [find("서울특별시")],
      ...(find("전국") ? { [rows[2].id as string]: [find("전국")] } : {}),
    },
  });
  // Trigger the browser-side search (the first page is server-rendered).
  await page
    .getByRole("combobox", { name: "정렬" })
    .first()
    .selectOption("deadline");
  const matched = page.getByRole("region", { name: /선택한 조건에 맞는 공고/ });
  await expect(matched.getByRole("heading", { level: 3 })).toHaveText([
    "마포구 대상 공고",
  ]);
  await expect(matched.getByText(/마포구 대상 · 접수 중/)).toBeVisible();
  const wider = page.getByRole("region", { name: "서울·전국 대상 공고" });
  await expect(wider.getByText("서울 전체", { exact: true })).toBeVisible();
  await expect(
    wider.getByRole("heading", { name: "서울 전체 대상 공고" }),
  ).toBeVisible();
  // 전국 is not a parent of 서울 in the region table, so the existing region
  // filter never returns nationwide posters here (the unit test covers 전국).
  await expect(page.getByText("신청할 수 있는")).toHaveCount(0);
  // Save the current condition in this browser.
  await page.getByRole("button", { name: "지금 조건 저장" }).click();
  await expect(
    page.getByRole("button", { name: "서울특별시 마포구", pressed: true }),
  ).toBeVisible();
  // Filters open in the sheet as real fieldsets.
  await page.getByRole("button", { name: /^분야:/ }).click();
  const sheet = page.getByRole("dialog", { name: "검색 조건" });
  await expect(sheet.getByRole("group", { name: "분야" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(writes).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("search on PC: sidebar fieldsets and one-column rows", async ({
  page,
}) => {
  await open(page, "/posters", 1280);
  const sidebar = page.getByRole("complementary", { name: "검색 조건" });
  await expect(sidebar.getByRole("group", { name: "지역" })).toBeVisible();
  await expect(sidebar.getByRole("group", { name: "분야" })).toBeVisible();
  await expect(
    sidebar.getByRole("checkbox", { name: "접수 중만 보기" }),
  ).toBeChecked();
  // The region list is short until expanded.
  const more = sidebar.getByRole("button", { name: "다른 지역 선택" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(
    sidebar.getByRole("radio", { name: "서울특별시 전체" }),
  ).toBeVisible();
  const input = page.getByLabel("공고, 기관 검색");
  expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(240);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
});
