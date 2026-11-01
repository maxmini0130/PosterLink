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

test("home ⑥ first visit: open posters first, a one-line condition prompt, no 'since' line", async ({
  page,
}) => {
  await open(page, "/", 390);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "지금 접수 중인 공고",
  );
  const first = page.getByRole("region", { name: "접수 중인 공고" });
  await expect(first.getByRole("heading", { level: 3 })).toHaveText([
    SOON.title as string,
    ONGOING.title as string,
    OLDER.title as string,
  ]);
  // Screen plan 03·04: no large guide boxes above the posters.
  await expect(
    page.getByText("관심 지역·분야를 고르면 맞는 공고를 먼저 보여드려요."),
  ).toBeVisible();
  await expect(page.getByText("찜해 두면 다음에 모아 보여드려요")).toHaveCount(
    0,
  );
  // Two cards per row on a phone.
  const boxes = await first
    .getByRole("listitem")
    .evaluateAll((items) =>
      items.slice(0, 2).map((item) => item.getBoundingClientRect().top),
    );
  expect(boxes[0]).toBe(boxes[1]);
  await expect(page.getByText("방문 이후")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "포스터 제보" })).toBeVisible();
  // The first visit is remembered without a baseline.
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pl.visit.v1") || "null"),
  );
  expect(stored.baselineAt).toBeNull();
});

test("home ⑦ new posters since the last visit, kept across a reload", async ({
  page,
}) => {
  const last = NOW - 10 * DAY;
  await open(page, "/", 390, {
    visit: {
      visitStartedAt: last - HOUR,
      lastActiveAt: last,
      baselineAt: null,
    },
    guestFavorites: [SOON.id as string],
  });
  await expect(page.getByText(visitDate(last))).toBeVisible();
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("지난 방문 이후 새 공고 2건");
  const fresh = page.getByRole("region", { name: "새로 올라온 공고" });
  await expect(fresh.getByRole("heading", { level: 3 })).toHaveText([
    SOON.title as string,
    ONGOING.title as string,
  ]);
  await expect(fresh.getByText("찜")).toBeVisible();
  // The 찜 poster closing soon is already in the grid: not repeated aside.
  await expect(
    page.getByRole("heading", { name: "7일 이내 마감" }),
  ).toHaveCount(0);
  // Same visit: a reload shows the same baseline and list.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(visitDate(last))).toBeVisible();
  await expect(title).toHaveText("지난 방문 이후 새 공고 2건");
});

test("home ⑧ return visit with nothing new: open posters and one line about institutions", async ({
  page,
}) => {
  const last = NOW - 40 * 60 * 1000;
  await open(page, "/", 390, {
    visit: {
      visitStartedAt: last - HOUR,
      lastActiveAt: last,
      baselineAt: null,
    },
  });
  await expect(
    page.getByText(`${visitDate(last)} 새 공고는 아직 없어요`),
  ).toBeVisible();
  const openList = page.getByRole("region", { name: "접수 중인 공고" });
  await expect(openList.getByRole("heading", { level: 3 })).toHaveText([
    SOON.title as string,
    ONGOING.title as string,
    OLDER.title as string,
  ]);
  await expect(
    page.getByText("관심 기관을 구독하면 새 공고를 여기에 모아 보여드려요."),
  ).toBeVisible();
  await expect(page.getByText("새로 올라온")).toHaveCount(0);
});

test("member home on PC: conditions, 2 columns, follows, started 찜, server visit write", async ({
  page,
}) => {
  const last = NOW - 3 * DAY;
  await open(page, "/", 1280, {
    member: true,
    serverVisit: {
      visitStartedAt: last - HOUR,
      lastActiveAt: last,
      baselineAt: null,
    },
  });
  await expect(page.getByText(visitDate(last))).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "지난 방문 이후 새 관심 공고 2건",
  );
  await expect(page.getByText("마포구 · 문화/행사 · 교육/취업")).toBeVisible();
  await expect(page.getByRole("link", { name: "조건 변경" })).toHaveAttribute(
    "href",
    "/mypage/edit",
  );
  const aside = page.getByRole("complementary", { name: "마감과 구독 소식" });
  await expect(aside.getByText("마포문화재단")).toBeVisible();
  await expect(aside.getByText(FOLLOWED.title as string)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "접수를 시작한 찜 공고" })
      .getByText(STARTED.title as string),
  ).toBeVisible();
  // Two columns at 1280: the aside sits to the right of the main column.
  const main = await page
    .getByRole("region", { name: "새로 올라온 관심 공고" })
    .boundingBox();
  const side = await aside.boundingBox();
  expect(side!.x).toBeGreaterThan(main!.x + main!.width - 1);
  // No bottom tab bar or floating report button on PC.
  await expect(page.locator(".pl-report-fab")).toBeHidden();
  // The new visit was sent through record_user_visit (fake response).
  expect(writes).toContain("POST /rest/v1/rpc/record_user_visit");
  // No horizontal scroll.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1280);
});

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
  await expect(wider.getByText("서울 전체 대상 공고")).toBeVisible();
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
