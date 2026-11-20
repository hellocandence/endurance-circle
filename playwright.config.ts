import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    // Mobile-first: 375px width is the primary target.
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: "pnpm db:migrate && pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
