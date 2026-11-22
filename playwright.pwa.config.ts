import { defineConfig, devices } from "@playwright/test";

// The service worker only exists in production builds, so these tests build the app and run `next start`.
// No database is queried: the pages under test never touch one, and the connection pool is lazy, so a dummy
// DATABASE_URL (required in production) is enough. Run with: pnpm e2e:pwa
const PORT = 3200;

// Tests must never send real mail: Next auto-loads .env.local (which holds the Gmail credentials), and a blank value
// set here wins over it, so getMailer() falls back to the dev mailer.
const NO_MAIL = { GMAIL_CLIENT_ID: "", GMAIL_CLIENT_SECRET: "", GMAIL_REFRESH_TOKEN: "", SMTP_USER: "", SMTP_PASS: "", BREVO_API_KEY: "", RESEND_API_KEY: "" };

export default defineConfig({
  testDir: "tests/pwa",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, serviceWorkers: "allow" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } }],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`.replace("/api/health", "/offline"),
    env: { ...NO_MAIL, AUTH_URL: `http://localhost:${PORT}`, DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unused" },
    reuseExistingServer: process.env.PWA_REUSE === "1", // opt-in only: a stale server from an old build gives false results
    timeout: 300_000,
  },
});
