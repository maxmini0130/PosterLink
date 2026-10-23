import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

const ids = {
  super_admin: "11111111-1111-4111-8111-111111111111",
  admin: "22222222-2222-4222-8222-222222222222",
  user: "33333333-3333-4333-8333-333333333333",
};
function sessionCookie(role: keyof typeof ids, forged = false) {
  const token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: ids[role],
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
        fixture_role: role,
        user_metadata: { role: "super_admin" },
      }),
    ).toString("base64url"),
  ].join(".");
  const signature = createHmac("sha256", "local-test-only-signing-secret")
    .update(token)
    .digest("base64url");
  return (
    "sb-127-auth-token=base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: token + "." + (forged ? "invalid" : signature),
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url")
  );
}
const local = (url: string | undefined) => url === "http://localhost:4002";

test("anonymous member/admin endpoints remain protected", async ({
  request,
}) => {
  expect(
    (await request.post("/api/onboarding/complete", { data: {} })).status(),
  ).toBe(401);
  expect(
    (
      await request.patch(`/api/admin/users/${ids.user}`, {
        data: { role: "admin" },
      })
    ).status(),
  ).toBe(401);
  const page = await request.get("/mypage/edit", { maxRedirects: 0 });
  expect([302, 307]).toContain(page.status());
  expect(page.headers().location).toContain("/login");
});

test("login and signup remain usable on desktop and mobile", async ({
  page,
  context,
}) => {
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (
      u.pathname.startsWith("/api/") ||
      (!u.hostname.includes("localhost") &&
        !u.hostname.includes("127.0.0.1") &&
        u.origin !== new URL(test.info().project.use.baseURL as string).origin)
    )
      return route.abort();
    return route.continue();
  });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    for (const label of [
      "카카오로 시작하기",
      "구글로 시작하기",
      "네이버로 시작하기",
    ])
      await expect(
        page.getByRole("button", { name: new RegExp(label) }),
      ).toBeVisible();
    await page.goto("/signup");
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "이메일로 가입하기", exact: true }),
    ).toBeDisabled();
    await page.locator("input[type=checkbox]").check();
    await expect(
      page.getByRole("button", { name: "이메일로 가입하기", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: test.info().outputPath(`signup-${viewport.width}.png`),
    });
  }
});

test("local server rejects member/admin and forged role claims", async ({
  request,
  baseURL,
}) => {
  test.skip(
    !local(baseURL),
    "Synthetic sessions are restricted to the local fixture",
  );
  const path = `/api/admin/users/${ids.user}`;
  for (const role of ["user", "admin"] as const)
    expect(
      (
        await request.patch(path, {
          headers: { Cookie: sessionCookie(role) },
          data: { role: "super_admin" },
        })
      ).status(),
    ).toBe(403);
  expect(
    (
      await request.patch(path, {
        headers: { Cookie: sessionCookie("user", true) },
        data: { role: "super_admin" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch(`/api/admin/users/${ids.super_admin}`, {
        headers: { Cookie: sessionCookie("super_admin") },
        data: { role: "user" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.patch(path, {
        headers: { Cookie: sessionCookie("super_admin") },
        data: { role: "unknown" },
      })
    ).status(),
  ).toBe(400);
});

test("local onboarding ignores role and foreign identity", async ({
  request,
  baseURL,
}) => {
  test.skip(!local(baseURL), "Local fixture only");
  await request.post("http://127.0.0.1:4010/control");
  const r = await request.post("/api/onboarding/complete", {
    headers: { Cookie: sessionCookie("user") },
    data: {
      id: ids.super_admin,
      role: "super_admin",
      nickname: "synthetic",
      regionId: "fixture-region",
      ageBand: "20s",
      gender: "prefer_not_to_say",
      categoryIds: [],
    },
  });
  expect(r.status()).toBe(200);
  const c = await (await request.get("http://127.0.0.1:4010/control")).json();
  expect(c.profileWrites).toBe(1);
  expect(c.lastProfileHasRole).toBe(false);
  expect(c.lastProfileIsMember).toBe(true);
});

test("local email signup sends no role and failure does not save profile", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.skip(
    !local(baseURL),
    "Local fixture only; never create a production account",
  );
  await context.route("https://**", (route) => route.abort());
  await context.route("**/api/**", (route) => route.fulfill({ json: {} }));
  for (const scenario of ["signup-failure", "normal"]) {
    await request.post(`http://127.0.0.1:4010/control?scenario=${scenario}`);
    await page.goto("/signup");
    await page.locator("input[type=email]").fill("fixture@example.invalid");
    await page.locator("input[type=password]").fill("fixture-password");
    await page.locator("input[type=checkbox]").check();
    await page
      .getByRole("button", { name: "이메일로 가입하기", exact: true })
      .click();
    if (scenario === "normal") await expect(page).toHaveURL(/onboarding/);
    else
      await expect(
        page.getByRole("button", { name: "이메일로 가입하기", exact: true }),
      ).toBeEnabled();
    const c = await (await request.get("http://127.0.0.1:4010/control")).json();
    expect(c.profileWrites).toBe(scenario === "normal" ? 1 : 0);
    expect(c.lastProfileHasRole).toBe(false);
  }
});

test("local staff profile save sends no role", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!local(baseURL), "Local fixture staff session only");
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: sessionCookie("super_admin").split("=")[1],
      url: baseURL!,
    },
  ]);
  let payload: Record<string, unknown> | null = null;
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith("/rest/v1/")) {
      if (
        u.pathname.endsWith("/profiles") &&
        route.request().method() === "POST"
      ) {
        payload = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: {} });
      }
      return route.fulfill({
        json: u.pathname.endsWith("/profiles")
          ? {
              id: ids.super_admin,
              role: "super_admin",
              nickname: "synthetic",
              onboarding_completed: true,
            }
          : [],
      });
    }
    if (u.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
    if (u.protocol === "https:") return route.abort();
    return route.continue();
  });
  await page.goto("/mypage/edit");
  await expect(
    page.getByRole("heading", { name: /프로필 수정/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /저장/ }).click();
  await expect(page).toHaveURL(/\/mypage$/);
  expect(payload).not.toBeNull();
  expect(payload).not.toHaveProperty("role");
  expect(payload).toHaveProperty("id", ids.super_admin);
});

test("local common OAuth callback preserves role-free profile upsert", async ({
  request,
  baseURL,
}) => {
  test.skip(
    !local(baseURL),
    "Synthetic tokens must never be sent to the remote Preview",
  );
  await request.post("http://127.0.0.1:4010/control");
  const encoded = sessionCookie("user").split("base64-")[1];
  const session = JSON.parse(Buffer.from(encoded, "base64url").toString());
  const r = await request.get(
    `/auth/callback?access_token=${encodeURIComponent(session.access_token)}&refresh_token=fixture-refresh`,
    { maxRedirects: 0 },
  );
  expect(r.status()).toBe(307);
  expect(r.headers().location).toContain("/onboarding");
  const c = await (await request.get("http://127.0.0.1:4010/control")).json();
  expect(c.profileWrites).toBe(1);
  expect(c.lastProfileHasRole).toBe(false);
});
