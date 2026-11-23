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

test("a member's progress page shows the full programme and, since T104, totals and body numbers for everyone", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  await page.goto("/progress");
  await page.getByRole("group", { name: "Bob Member" }).getByRole("link", { name: "Bob Member" }).click();
  await expect(page).toHaveURL(/\/progress\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Bob Member", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Day by day" }).getByRole("listitem")).toHaveCount(75);
  await expect(page.getByRole("img", { name: /^Completion by week/ })).toBeVisible();
  await expect(page.getByText("Current streak")).toBeVisible();
  // the circle is open: someone else's totals and body numbers are visible too
  await expect(page.getByRole("region", { name: "Totals" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Body and targets" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/progress");
  await page.getByRole("group", { name: "Alice Member" }).getByRole("link", { name: "Alice Member" }).click();
  await expect(page.getByRole("heading", { name: "Alice Member", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Totals" })).toBeVisible();
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

test("T104/T105: My daily logs lists every day with everything logged, and other members can read it", async ({ browser }) => {
  const base = test.info().project.use.baseURL;
  const open = async (email: string) => {
    const ctx = await browser.newContext({ baseURL: base });
    const page = await ctx.newPage();
    await loginAs(page, email, MONDAY);
    return { ctx, page };
  };
  const erin = await open("erin@e2e.test");
  await erin.page.request.put("/api/tracker/2026-11-23", { data: { techNote: "ERIN-TECH-TIP", privateNotes: "ERIN-NOTE-FOR-ALL", studyTopic: "ERIN-TOPIC", runKm: 7 } });
  const erinId = (await (await erin.page.request.get("/api/me")).json()).id as string;

  await erin.page.goto("/progress");
  await erin.page.getByRole("link", { name: "My daily logs" }).click();
  await expect(erin.page).toHaveURL(new RegExp(`/progress/${erinId}/logs$`));
  await expect(erin.page.getByRole("heading", { name: "My daily logs", level: 1 })).toBeVisible();
  await expect(erin.page.getByRole("list", { name: "Daily logs" }).getByRole("listitem").first()).toContainText("Day 23");
  await expect(erin.page.getByText("ERIN-TECH-TIP")).toBeVisible();
  await expect(erin.page.getByText("ERIN-NOTE-FOR-ALL")).toBeVisible();

  // another member reads the same logs, with the notes (the circle is open)
  const bob = await open("bob@e2e.test");
  await bob.page.goto(`/progress/${erinId}/logs`);
  await expect(bob.page.getByRole("heading", { name: /daily logs/i, level: 1 })).toBeVisible();
  await expect(bob.page.getByText("ERIN-TECH-TIP")).toBeVisible();
  await expect(bob.page.getByText("ERIN-NOTE-FOR-ALL")).toBeVisible();
  await bob.page.goto(`/progress/${erinId}`);
  await expect(bob.page.getByRole("region", { name: "Body and targets" })).toBeVisible();
  expect(await bob.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // a finished day is locked: yesterday can no longer be edited (API), today still can
  expect((await erin.page.request.put("/api/tracker/2026-11-22", { data: { runKm: 1 } })).status()).toBe(409);
  expect((await erin.page.request.put("/api/tracker/2026-11-23", { data: { runKm: 8 } })).status()).toBe(200);
  for (const c of [erin, bob]) await c.ctx.close();
});
