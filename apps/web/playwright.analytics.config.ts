import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "analytics.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4000",
    storageState: process.env.RELEASE_STORAGE_STATE,
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm exec next dev -p 4000",
        url: "http://localhost:4000/login",
        reuseExistingServer: false,
        env: {
          NEXT_PUBLIC_GA_ENABLED: "false",
          NEXT_PUBLIC_GA_POLICY_REVIEWED: "false",
          NEXT_PUBLIC_GA_MEASUREMENT_ID: "",
          NEXT_PUBLIC_SENTRY_DSN: "",
        },
      },
});
