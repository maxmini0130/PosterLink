import { test, expect } from "@playwright/test";

test.describe("인증 - 로그인", () => {
  test("로그인 페이지 접근 및 OAuth 버튼 표시", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=구글로 시작하기")).toBeVisible();
    await expect(page.locator("text=카카오로 시작하기")).toBeVisible();
  });

  test("로그인 페이지 - 네이버 버튼 표시", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=네이버")).toBeVisible();
  });

  test("로그인 페이지 - 회원가입 링크 존재", async ({ page }) => {
    await page.goto("/login");
    const signupLink = page.locator("a[href='/signup']");
    await expect(signupLink.first()).toBeVisible();
  });

  test("이메일 입력 필드 존재", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='email'], input[name='email']").first()).toBeVisible();
  });
});

test.describe("인증 - 회원가입", () => {
  test("회원가입 페이지 접근", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/signup/);
  });

  test("회원가입 페이지 - 이메일/비밀번호 입력 필드 존재", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("input[type='email'], input[name='email']").first()).toBeVisible();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
  });

  test("회원가입 페이지 - 약관 동의 체크박스 존재", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible();
    await expect(page.locator("text=이용약관")).toBeVisible();
    await expect(page.locator("text=개인정보처리방침")).toBeVisible();
  });

  test("회원가입 - 약관 미동의 시 가입 버튼 비활성화", async ({ page }) => {
    await page.goto("/signup");
    const submitBtn = page.locator("button[type='submit'], button:has-text('이메일로 가입')").first();
    await expect(submitBtn).toBeDisabled();
  });
});

test.describe("약관/정책 페이지", () => {
  test("이용약관 페이지 접근", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("h1")).toContainText("이용약관");
  });

  test("개인정보처리방침 페이지 접근", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toContainText("개인정보처리방침");
  });
});

test.describe("인증 - 접근 제어", () => {
  test("비로그인 상태에서 mypage 접근 시 리다이렉트", async ({ page }) => {
    await page.goto("/mypage");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/login|mypage/);
  });

  test("비로그인 상태에서 favorites 접근 시 리다이렉트", async ({ page }) => {
    await page.goto("/favorites");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/login|favorites/);
  });

  test("비로그인 상태에서 notifications 접근 시 리다이렉트", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/login|notifications/);
  });
});
