import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: {
          // Bypass CSP for local development
          bypassCSP: true,
        },
        launchOptions: {
          args: [
            // Disable Private Network Access checks for local development
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "pnpm dev --port 5199 --strictPort",
    url: "http://localhost:5199/src/webview/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
