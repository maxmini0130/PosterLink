import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:4000";
const usesRemoteServer = /^https?:\/\//i.test(process.env.E2E_BASE_URL || "");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "readonly-chromium",
      // OCR's check-deadlines endpoint may change operating data. Mobile action
      // tests run separately against WebKit/Chromium mobile device projects.
      testIgnore: [
        "**/authenticated/**",
        "**/ocr.spec.ts",
        "**/mobile-detail-actions.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: usesRemoteServer
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
      },
});
