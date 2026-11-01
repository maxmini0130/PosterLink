import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// 내 공고 (UI redesign ⑨⑩) and the PC account menu, against the local server
// (playwright.ui-components.config.ts). Account data is mocked in the browser;
// public poster reads use the public key; every write gets a fake response and
// never reaches the database. Needs E2E_SUPABASE_REF and a local .env.local.
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
  (envText.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m) ?? [])[1]
    ?.trim()
    .replace(/^"|"$/g, "") ?? "";
const OPEN =
  process.env.E2E_DETAIL_POSTER_ID ?? "114a869d-fdb4-4ec2-a732-6a2b5804037e";
const NOTICE =
  process.env.E2E_NOTICE_POSTER_ID ?? "481c1aae-f29f-493a-9f33-3c489852d016";
const CLOSED =
  process.env.E2E_CLOSED_POSTER_ID ?? "dd64555d-2de7-428a-8fc2-13e4200df562";
const OTHER =
  process.env.E2E_OTHER_POSTER_ID ?? "59d9c004-c280-4867-b49b-6ac45c432c86";
const USER = "00000000-0000-4000-8000-000000000001";
const GONE = "99999999-9999-4999-8999-999999999999"; // no such poster
let writes: string[] = [];
// The mocked account's favorites; writes update it like the server would.
let account = new Map<string, string>();
// When set, the next favorites read answers with what it saw at request time
// only after release() — replays a reload that finishes after a write.
type Hold = {
  /** Resolves when the held read reaches the mock. */
  arrived: Promise<void>;
  release: () => void;
  reached: () => void;
  released: Promise<void>;
};
let hold: Hold | null = null;
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  status: 200,
  contentType: "application/json",
  headers,
  body: JSON.stringify(body),
});
test.beforeEach(() => {
  writes = [];
  hold = null;
  account = new Map([
    [OPEN, "applied"],
    [NOTICE, "interested"],
    [CLOSED, "applied"],
  ]);
});

function holdNextFavoritesRead(): Hold {
  const entry = {} as Hold;
  entry.released = new Promise<void>((resolve) => (entry.release = resolve));
  entry.arrived = new Promise<void>((resolve) => (entry.reached = resolve));
  hold = entry;
  return entry;
}

async function open(
  p: Page,
  width: number,
  {
    member = false,
    guestIds = [] as string[],
    notice = null as number | null,
    applySupported = true,
  } = {},
) {
  await p.setViewportSize({ width, height: 900 });
  await p.route("**/*", async (r) => {
    const req = r.request();
    const u = req.url();
    const m = req.method();
    if (
      m === "GET" &&
      /\/api\/image-proxy|\/storage\/v1\/object\/public\//.test(u)
    )
      return r.continue();
    if (member && /\/auth\/v1\/user/.test(u))
      return r.fulfill(
        json({
          id: USER,
          aud: "authenticated",
          role: "authenticated",
          email: "tester@example.com",
        }),
      );
    if (/supabase\.co\/rest\/v1\//.test(u)) {
      // Writes get a fake success here and never reach the server.
      if (m !== "GET" && m !== "HEAD") {
        writes.push(m + " " + new URL(u).pathname);
        const target = new URL(u).searchParams.get("poster_id")?.slice(3);
        if (/\/rest\/v1\/favorites/.test(u) && target) {
          if (m === "DELETE") account.delete(target);
          if (m === "PATCH")
            account.set(target, JSON.parse(req.postData() || "{}").user_status);
        }
        return r.fulfill({ status: 204, body: "" });
      }
      if (member && /\/rest\/v1\/favorites/.test(u)) {
        if (!applySupported && /user_status/.test(u))
          return r.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              code: "42703",
              message: "column favorites.user_status does not exist",
            }),
          });
        const ids = new URL(u).searchParams.get("poster_id");
        const rows = [...account]
          .filter(([id]) => !ids || ids.includes(id))
          .map(([poster_id, user_status]) => ({ poster_id, user_status }));
        const held = hold;
        if (held && !ids) {
          hold = null;
          held.reached();
          await held.released; // answers with the rows as they were at request time
        }
        return r.fulfill(json(rows));
      }
      if (member && /\/rest\/v1\/institution_follows/.test(u))
        return r.fulfill(
          json([
            {
              institution_id: "i1",
              institutions: {
                id: "77777777-7777-4777-8777-777777777777",
                name: "샘플 문화재단",
                slug: "bizinfo",
              },
            },
          ]),
        );
      if (member && /\/rest\/v1\/profiles/.test(u))
        return r.fulfill(json({ role: "user" }));
      if (member && /\/rest\/v1\/notifications/.test(u))
        return r.fulfill(json([], { "content-range": "0-0/0" }));
      if (
        /\/rest\/v1\/(posters|poster_categories|poster_regions|categories|regions)/.test(
          u,
        )
      )
        return r.continue({
          headers: { ...req.headers(), authorization: "Bearer " + ANON },
        }); // public reads with the public key, never the fake session
      return r.abort();
    }
    if (/supabase\.co|\/api\/|sentry\.io/.test(u)) return r.abort();
    return r.continue();
  });
  await p.addInitScript(
    ({ member, guestIds, notice, ref, user }) => {
      if (guestIds.length)
        localStorage.setItem(
          "pl.guest_favorites.v1",
          JSON.stringify({
            v: 1,
            items: guestIds.map((id, i) => ({ posterId: id, savedAt: i })),
          }),
        );
      if (notice)
        localStorage.setItem(
          "pl.guest_merge_notice.v1",
          JSON.stringify({ v: 1, count: notice, at: 1 }),
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
        document.cookie =
          "sb-" + ref + "-auth-token=base64-" + encoded + "; path=/";
      }
    },
    { member, guestIds, notice, ref: REF, user: USER },
  );
  await p.goto("/my-posters", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
}

test("guest: this browser's favorites, no account tabs, 찜 취소", async ({
  page,
}) => {
  await open(page, 390, { guestIds: [OPEN, NOTICE] });
  await expect(
    page.getByRole("heading", { name: "이 기기에 찜한 공고 2개" }),
  ).toBeVisible();
  await expect(page.getByText("이 기기에 저장됨")).toHaveCount(2);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.getByRole("button", { name: "찜 취소" }).first().click();
  await expect(page.getByText("이 기기에 저장됨")).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "주요 탐색" })
      .getByRole("link", { name: "내 공고" }),
  ).toHaveAttribute("aria-current", "page");
});

test("member: merge notice, tabs, reception groups and the apply mark", async ({
  page,
}) => {
  await open(page, 390, { member: true, notice: 2 });
  await expect(
    page.getByText("이 기기에 찜한 공고 2개를 계정으로 옮겼어요"),
  ).toBeVisible();
  expect((await page.getByRole("tab").allTextContents()).join("|")).toBe(
    "찜 3|신청 표시 2|구독 기관 1",
  );
  expect(
    (await page.locator("#my-panel-favorites h2").allTextContents()).join(
      " > ",
    ),
  ).toBe("접수 중 2 > 접수 종료 1");
  await page.getByRole("button", { name: "안내 닫기" }).click();
  await expect(page.getByText("계정으로 옮겼어요")).toHaveCount(0);
  await page.getByRole("tab", { name: /^찜/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /신청 표시/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#my-panel-applied li")).toHaveCount(2);
  await page.getByRole("tab", { name: /^찜/ }).click();
  await page
    .locator("#my-panel-favorites")
    .getByRole("button", { name: "신청했어요" })
    .first()
    .click();
  await expect
    .poll(() => writes.some((x) => x.startsWith("PATCH /rest/v1/favorites")))
    .toBe(true);
});

test("member before the user_status migration: no apply mark or 신청 표시 tab", async ({
  page,
}) => {
  await open(page, 390, { member: true, applySupported: false });
  expect((await page.getByRole("tab").allTextContents()).join("|")).toBe(
    "찜 3|구독 기관 1",
  );
  await expect(page.getByRole("button", { name: "신청했어요" })).toHaveCount(0);
});

test("sign-in merges guest favorites once and clears them after success", async ({
  page,
}) => {
  await open(page, 390, { member: true, guestIds: [OPEN, OTHER] });
  await expect(
    page.getByText("이 기기에 찜한 공고 2개를 계정으로 옮겼어요"),
  ).toBeVisible();
  // OPEN is already in the (mocked) account, so only OTHER is written.
  expect(writes.filter((x) => x === "POST /rest/v1/favorites")).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("pl.guest_favorites.v1") || "{}").items
          ?.length,
    ),
  ).toBe(0);
});

test("PC account menu opens, moves with keys and closes", async ({ page }) => {
  await open(page, 1280, { member: true });
  const button = page.getByRole("button", { name: "마이" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  const menu = page.getByRole("menu", { name: "계정 메뉴" });
  expect((await menu.getByRole("menuitem").allTextContents()).join("|")).toBe(
    "내 공고|관심 조건 수정|알림 설정|계정 관리|로그아웃",
  );
  await expect(menu.getByRole("menuitem", { name: "내 공고" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "로그아웃" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
  await button.click();
  await page.mouse.click(10, 600);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(
    page
      .getByRole("navigation", { name: "주요 메뉴" })
      .getByRole("link", { name: "내 공고" }),
  ).toHaveAttribute("aria-current", "page");
});

test("a reload that finishes after a write does not undo it", async ({
  page,
}) => {
  await open(page, 390, { member: true });
  const panel = page.locator("#my-panel-favorites");
  const reload = () =>
    page.evaluate(() => window.dispatchEvent(new Event("pl:guest-merged")));

  // 신청 표시 while an older reload is still on its way.
  let held = holdNextFavoritesRead();
  await reload();
  await held.arrived;
  await panel.getByRole("button", { name: "신청했어요" }).first().click();
  await expect(panel.getByText("신청 표시됨")).toHaveCount(3);
  held.release();
  await page.waitForTimeout(800);
  await expect(panel.getByText("신청 표시됨")).toHaveCount(3);

  // 찜 취소 while another older reload is on its way.
  held = holdNextFavoritesRead();
  await reload();
  await held.arrived;
  await panel.getByRole("button", { name: "찜 취소" }).first().click();
  await expect(panel.locator("li")).toHaveCount(2);
  held.release();
  await page.waitForTimeout(800);
  await expect(panel.locator("li")).toHaveCount(2);
});

test("a deleted poster does not block the merge and can be removed from this device", async ({
  page,
}) => {
  await open(page, 390, { member: true, guestIds: [GONE, OTHER] });
  await expect(
    page.getByText("이 기기에 찜한 공고 1개를 계정으로 옮겼어요"),
  ).toBeVisible();
  expect(writes.filter((x) => x === "POST /rest/v1/favorites")).toHaveLength(1);
  await expect(
    page.getByText("1개는 삭제되었거나 지금 볼 수 없는 공고라"),
  ).toBeVisible();
  const left = () =>
    page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("pl.guest_favorites.v1") || "{}",
        ).items?.map((item: { posterId: string }) => item.posterId) ?? [],
    );
  expect(await left()).toEqual([GONE]);
  await page.getByRole("button", { name: "이 기기에서 지우기" }).click();
  await expect(page.getByText("삭제되었거나")).toHaveCount(0);
  expect(await left()).toEqual([]);
});
