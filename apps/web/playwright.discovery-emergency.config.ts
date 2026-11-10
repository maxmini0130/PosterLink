import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "discovery-emergency.spec.ts",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4002",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm exec next start -p 4002",
    url: "http://localhost:4002/login",
    reuseExistingServer: false,
    env: {
      NODE_OPTIONS: `--require=${path.resolve(__dirname, "../../scripts/security/read-only-supabase.cjs")}`,
      NEXT_PUBLIC_GA_ENABLED: "false",
      NEXT_PUBLIC_GA_POLICY_REVIEWED: "false",
    },
  },
});
