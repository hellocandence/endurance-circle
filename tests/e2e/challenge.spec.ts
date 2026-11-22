import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hydrated, loginAs, MONDAY, SUNDAY } from "./helpers";

// The circle-wide fresh start (Day 1 = Monday 2026-11-23 for everyone) and the owner-only restart.
// Planner has no programme yet; the first tests walk her through the start, so they run in order.
test.describe.configure({ mode: "serial" });

const NO_UUID = "00000000-0000-4000-8000-000000000000";

test("starting, joining and restarting all need a session", async ({ request }) => {
  expect((await request.post("/api/tracker/start", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/tracker/join", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/admin/challenge/restart", { data: { scope: "all" } })).status()).toBe(401);
});

test("the day before, a new member can join the new challenge and sees the countdown", async ({ page }) => {
  await loginAs(page, "planner@e2e.test", SUNDAY);
  await page.goto("/today");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: /A new challenge starts Monday, 23 November/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  await page.getByRole("button", { name: "Count me in" }).click();
  await expect(page.getByRole("heading", { name: /starts Monday, 23 November/ })).toBeVisible();
  await expect(page.getByText("That is tomorrow.")).toBeVisible();
  // no controls to move the date, and nothing to log yet
  await expect(page.getByRole("button", { name: /Start today instead|Change start date/ })).toHaveCount(0);
  expect((await page.request.get("/api/tracker/today")).status()).toBe(409);
});

test("on Monday the same member is on Day 1, with a fresh log", async ({ page }) => {
  await loginAs(page, "planner@e2e.test", MONDAY);
  await page.goto("/today");
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 1");
});

test("a regular member has no Restart option and the server refuses every restart", async ({ page }) => {
  await loginAs(page, "planner@e2e.test", MONDAY);
  await page.goto("/settings");
  await hydrated(page);
  const section = page.getByRole("region", { name: "Challenge" });
  await expect(section.getByText(/Day 1 of 75\. Started Mon, 23 Nov/)).toBeVisible();
  await expect(section.getByRole("button", { name: /Restart/ })).toHaveCount(0);

  for (const data of [{ scope: "self" }, { scope: "all" }, { scope: "user", userId: NO_UUID }]) {
    expect((await page.request.post("/api/admin/challenge/restart", { data })).status(), JSON.stringify(data)).toBe(403);
  }
  expect((await page.request.post("/api/tracker/restart", { data: {} })).ok()).toBe(false); // the old member route is gone
  // and nothing changed
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 1");
});

test("the owner sees the restart controls with the three options", async ({ page }) => {
  await loginAs(page, "owner@e2e.test", MONDAY);
  await page.goto("/settings");
  await hydrated(page);
  const section = page.getByRole("region", { name: "Challenge" });
  await section.getByRole("button", { name: "Restart challenge (owner)" }).click();
  for (const name of ["My own challenge", "Everyone's challenge", "One member's challenge"]) await expect(section.getByRole("radio", { name })).toBeVisible();
  await section.getByRole("radio", { name: "One member's challenge" }).check();
  await expect(section.getByRole("button", { name: "Yes, restart" })).toBeDisabled(); // no member picked yet
  await section.getByRole("radio", { name: "Everyone's challenge" }).check();
  await expect(section.getByText(/restarts the challenge for all \d+ members/)).toBeVisible();
});

test("the owner endpoint validates input and refuses bad dates without changing anything", async ({ page }) => {
  await loginAs(page, "owner@e2e.test", MONDAY);
  const post = (data: unknown) => page.request.post("/api/admin/challenge/restart", { data });
  expect((await post({ scope: "nobody" })).status()).toBe(400);
  expect((await post({ scope: "user" })).status()).toBe(400); // user id required
  expect((await post({ scope: "user", userId: NO_UUID })).status()).toBe(404);
  for (const startDate of ["2026-11-01", "2027-06-01", "2026-02-30", "soon"]) {
    expect((await post({ scope: "all", startDate })).status(), startDate).toBe(400);
  }
  // refused restarts left everyone's programme alone
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Day \d+/);
});
