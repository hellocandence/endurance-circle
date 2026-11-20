import type { Page } from "@playwright/test";
import { E2E_PASSWORD } from "./setup/constants";

/** Pages stream in behind a loading skeleton, so wait for the network to settle (hydrated) before interacting. */
export const hydrated = (page: Page) => page.waitForLoadState("networkidle");

export const MONDAY = "2026-11-23T06:00:00Z"; // 11:30 in Kolkata
export const SUNDAY = "2026-11-22T06:00:00Z";

/** Sign in through the real API (cookies land in the page's context) and pin the server clock. */
export async function loginAs(page: Page, email: string, now: string = MONDAY) {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.context().setExtraHTTPHeaders({ "x-cadence-test-now": now, "cf-connecting-ip": ip });
  const res = await page.request.post("/api/login", { data: { email, password: E2E_PASSWORD } });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
}
