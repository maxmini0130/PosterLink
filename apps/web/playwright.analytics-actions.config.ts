import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "analytics-actions.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:4001", serviceWorkers: "block" },
  projects: [
    { name: "local-synthetic-auth", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm exec next dev -p 4001",
    url: "http://localhost:4001/login",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TESTFIXTURE",
      NEXT_PUBLIC_GA_ENABLED: "true",
      NEXT_PUBLIC_GA_POLICY_REVIEWED: "true",
      NEXT_PUBLIC_GA_ALLOW_NON_PRODUCTION: "true",
      NEXT_PUBLIC_GA_DEBUG: "false",
      NEXT_PUBLIC_VERCEL_ENV: "preview",
      NEXT_PUBLIC_SENTRY_DSN: "",
    },
  },
});
