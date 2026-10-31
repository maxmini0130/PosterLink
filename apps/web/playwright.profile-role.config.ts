import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/security",
  testMatch: "profile-role.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4002",
    storageState: process.env.RELEASE_STORAGE_STATE,
    serviceWorkers: "block",
  },
  projects: [{ name: "profile-role", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "node e2e/security/profile-role-fixture.mjs",
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
            NEXT_PUBLIC_SENTRY_DSN: "",
          },
        },
      ],
});
