import { defineConfig, devices } from "@playwright/test";

// Always isolated: no production storageState, credentials or remote baseURL.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "traffic-contract.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://localhost:4004", serviceWorkers: "block" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node e2e/traffic-fixture.mjs",
      url: "http://127.0.0.1:4014",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec next dev -p 4004",
      url: "http://localhost:4004/login",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4014",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-fixture-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "local-fixture-service-key",
        NEXT_PUBLIC_GA_ENABLED: "false",
        NEXT_PUBLIC_SENTRY_DSN: "",
      },
    },
  ],
});
