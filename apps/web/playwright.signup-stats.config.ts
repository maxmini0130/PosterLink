import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: "./e2e",
  testMatch: "signup-stats.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    storageState: process.env.RELEASE_STORAGE_STATE,
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4002",
    serviceWorkers: "block",
  },
  projects: [{ name: "signup-stats", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "node e2e/signup-stats-fixture.mjs",
          url: "http://127.0.0.1:4010",
          reuseExistingServer: false,
        },
        {
          command: "pnpm exec next dev -p 4002",
          url: "http://localhost:4002/login",
          reuseExistingServer: false,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4010",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture-anon-key",
            SUPABASE_SERVICE_ROLE_KEY: "local-fixture-service-key",
            NEXT_PUBLIC_GA_ENABLED: "false",
            NEXT_PUBLIC_SENTRY_DSN: "",
          },
        },
      ],
});
