import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT as PORT } from "./tests/e2e/setup/constants";

// Tests must never send real mail: Next auto-loads .env.local (which holds the Gmail credentials), and a blank value
// set here wins over it, so getMailer() falls back to the dev mailer.
const NO_MAIL = { GMAIL_CLIENT_ID: "", GMAIL_CLIENT_SECRET: "", GMAIL_REFRESH_TOKEN: "", SMTP_USER: "", SMTP_PASS: "", BREVO_API_KEY: "", RESEND_API_KEY: "" };
const REAL_DB = process.env.E2E_DATABASE_URL;

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
  // An isolated server: its own port and database (fresh and seeded every run), so tests never touch dev
  // data and rate-limit counters start clean. By default the database is embedded PGlite; set
  // E2E_DATABASE_URL (a database named *e2e* or *test*) to run the same suite against a real Postgres.
  webServer: {
    command: `${REAL_DB ? "pnpm exec tsx tests/e2e/setup/reset-db.ts" : "rm -rf .data/e2e"} && pnpm db:migrate && pnpm exec tsx tests/e2e/setup/seed.ts && pnpm exec next dev --turbopack -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { ...NO_MAIL, PGLITE_DIR: ".data/e2e", AUTH_URL: `http://localhost:${PORT}`, DATABASE_URL: REAL_DB ?? "" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
