import { defineConfig, devices } from "@playwright/test";

/**
 * Checks for the redesigned shared components on the /dev/ui review page.
 * No global setup (no test accounts, no sign-in). Start the app first with
 * UI_SHOWCASE=1, e.g. `UI_SHOWCASE=1 npx next start -p 4011`, then run
 * `E2E_UI_SHOWCASE=1 npx playwright test -c playwright.ui-components.config.ts`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "ui-components.spec.ts",
    "poster-detail-guest.spec.ts",
    "my-posters.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4011",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
