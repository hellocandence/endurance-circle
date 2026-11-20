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
