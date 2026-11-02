import { defineConfig, devices } from "@playwright/test";

/** No account setup. The test allows public reads and blocks all writes. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "poster-feed-mobile.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4000",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    {
      name: "iphone-small-safari",
      use: { ...devices["iPhone SE"], browserName: "webkit" },
    },
    {
      name: "iphone-safari",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "android-chrome",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
});
