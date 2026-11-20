import { defineConfig, devices } from "@playwright/test";

// The service worker only exists in production builds, so these tests build the app and run `next start`.
// No database is queried: the pages under test never touch one, and the connection pool is lazy, so a dummy
// DATABASE_URL (required in production) is enough. Run with: pnpm e2e:pwa
const PORT = 3200;

export default defineConfig({
  testDir: "tests/pwa",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, serviceWorkers: "allow" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } }],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`.replace("/api/health", "/offline"),
    env: { AUTH_URL: `http://localhost:${PORT}`, DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unused" },
    reuseExistingServer: process.env.PWA_REUSE === "1", // opt-in only: a stale server from an old build gives false results
    timeout: 300_000,
  },
});
