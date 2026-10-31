import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:4000";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "mobile-detail-actions.spec.ts",
  workers: 1,
  timeout: 45000,
  use: { baseURL, serviceWorkers: "block", screenshot: "only-on-failure" },
  projects: [
    {
      name: "iphone-safari",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "iphone-small-safari",
      use: { ...devices["iPhone SE"], browserName: "webkit" },
    },
    {
      name: "android-chrome",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: true },
});
