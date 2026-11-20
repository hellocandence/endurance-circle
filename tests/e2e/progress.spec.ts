import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MEMBER_COUNT } from "./setup/constants";
import { loginAs, MONDAY } from "./helpers";

test("AT-05: the progress feed needs a session", async ({ request }) => {
  expect((await request.get("/api/progress")).status()).toBe(401);
});

test("progress API and page list every member with server-computed percentages", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  const res = await page.request.get("/api/progress");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.members).toHaveLength(MEMBER_COUNT);
  for (const m of body.members) {
    expect(m.window.pct).toBeGreaterThanOrEqual(0);
    expect(m.window.pct).toBeLessThanOrEqual(100);
    expect(m.last7.elapsed).toBeLessThanOrEqual(7);
  }
  expect(JSON.stringify(body)).not.toMatch(/weight|privateNotes|email/i);

  await page.goto("/progress");
  expect(page.viewportSize()!.width).toBe(375);
  await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress by member" }).getByRole("listitem")).toHaveCount(MEMBER_COUNT);
  await expect(page.getByRole("group", { name: "Alice Member" }).getByRole("progressbar", { name: "Overall" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Alice Member" }).getByRole("progressbar", { name: "Last 7 days" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.waitForTimeout(1000);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test("a member's progress page shows the full programme, and private stats only on your own", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  await page.goto("/progress");
  await page.getByRole("group", { name: "Bob Member" }).getByRole("link", { name: "Bob Member" }).click();
  await expect(page).toHaveURL(/\/progress\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Bob Member", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Day by day" }).getByRole("listitem")).toHaveCount(75);
  await expect(page.getByRole("img", { name: /^Completion by week/ })).toBeVisible();
  await expect(page.getByText("Current streak")).toBeVisible();
  // someone else's page: public numbers only
  await expect(page.getByRole("region", { name: "Your private stats" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/progress");
  await page.getByRole("group", { name: "Alice Member" }).getByRole("link", { name: "Alice Member" }).click();
  await expect(page.getByRole("heading", { name: "Alice Member", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your private stats" })).toBeVisible();
  await page.waitForTimeout(1000);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test("the member progress page needs a session and ignores bad ids", async ({ page }) => {
  await page.goto("/progress/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/login/);
  await loginAs(page, "alice@e2e.test", MONDAY);
  // (the page streams behind a loading skeleton, so the status is already 200: check the 404 content)
  await page.goto("/progress/not-a-uuid");
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await page.goto("/progress/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This page could not be found")).toBeVisible();
});
