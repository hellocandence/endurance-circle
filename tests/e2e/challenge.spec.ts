import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hydrated, loginAs, MONDAY } from "./helpers";

// One member (Planner) walks the whole start-date story, so these run in order. The server clock is pinned to Monday 2026-11-23.
test.describe.configure({ mode: "serial" });

test("starting and restarting needs a session", async ({ request }) => {
  expect((await request.post("/api/tracker/start", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/tracker/restart", { data: {} })).status()).toBe(401);
});

test("a new member can schedule Day 1 for a later date, see the countdown, and start today instead", async ({ page }) => {
  await loginAs(page, "planner@e2e.test", MONDAY);
  await page.goto("/today");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "Ready to begin?" })).toBeVisible();

  // the choices
  await expect(page.getByRole("radio", { name: /Today/ })).toBeChecked();
  await page.getByRole("radio", { name: /Pick a date/ }).check();
  await page.getByLabel("Start date").fill("2026-11-30");
  await page.getByRole("button", { name: "Schedule my 75 Hard" }).click();

  await expect(page.getByRole("heading", { name: /starts Monday, 30 November/ })).toBeVisible();
  await expect(page.getByText("That is in 7 days.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  // nothing to log yet, and the API says so
  const today = await page.request.get("/api/tracker/today");
  expect(today.status()).toBe(409);
  expect(await today.json()).toMatchObject({ error: "not_started_yet", startDate: "2026-11-30" });

  await page.getByRole("button", { name: "Start today instead" }).click();
  await expect(page.getByRole("heading", { name: /Day 1/ })).toBeVisible();
});

test("Settings shows the challenge and restarts it on a chosen date without deleting anything", async ({ page }) => {
  await loginAs(page, "planner@e2e.test", MONDAY);
  await page.goto("/settings");
  await hydrated(page);
  const section = page.getByRole("region", { name: "Challenge" });
  await expect(section.getByText(/Day 1 of 75\. Started Mon, 23 Nov/)).toBeVisible();

  await section.getByRole("button", { name: "Restart challenge" }).click();
  await expect(section.getByText(/kept safely and not deleted/)).toBeVisible();
  await section.getByRole("radio", { name: /Pick a date/ }).check();
  await section.getByLabel("Start date").fill("2026-12-07");
  await section.getByRole("button", { name: "Yes, restart" }).click();
  await expect(section.getByText(/Fresh start\. Day 1 is Mon, 7 Dec/)).toBeVisible();
  await expect(section.getByText(/Starts Mon, 7 Dec \(in 14 days\)/)).toBeVisible();

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: /starts Monday, 7 December/ })).toBeVisible();
});

test("the server refuses past dates, dates too far ahead and nonsense", async ({ page }) => {
  await loginAs(page, "planner@e2e.test", MONDAY);
  for (const startDate of ["2026-11-01", "2027-06-01", "2026-02-30", "soon"]) {
    const res = await page.request.post("/api/tracker/restart", { data: { startDate } });
    expect(res.status(), startDate).toBe(400);
  }
  // and a refused restart changed nothing
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: /starts Monday, 7 December/ })).toBeVisible();
});
