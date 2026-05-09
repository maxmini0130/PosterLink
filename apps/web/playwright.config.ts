import { defineConfig, devices } from "@playwright/test";
import path from "path";

const authDir = path.join(__dirname, "e2e/.auth");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // 비인증 — 기존 테스트 전체
    {
      name: "chromium",
      testIgnore: "**/authenticated/**",
      use: { ...devices["Desktop Chrome"] },
    },
    // 일반 사용자 세션
    {
      name: "user",
      testMatch: "**/authenticated/user/**",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "user.json"),
      },
    },
    // 관리자 세션
    {
      name: "admin",
      testMatch: "**/authenticated/admin/**",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "admin.json"),
      },
    },
    // 운영자 세션
    {
      name: "operator",
      testMatch: "**/authenticated/operator/**",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "operator.json"),
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:4000",
    reuseExistingServer: true,
  },
});
