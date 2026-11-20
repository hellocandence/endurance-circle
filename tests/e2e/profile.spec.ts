import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY } from "./helpers";

const meId = async (page: Page) => (await (await page.request.get("/api/me")).json()).id as string;

test("AT-05: profile routes need a session", async ({ request }) => {
  expect((await request.get("/api/profile")).status()).toBe(401);
  expect((await request.patch("/api/profile", { data: { name: "x" } })).status()).toBe(401);
});

test("a member edits their own profile; the change shows on the dashboard", async ({ page }) => {
  await loginAs(page, "carol@e2e.test", MONDAY);
  await page.goto("/settings");
  expect(page.viewportSize()!.width).toBe(375);
  await page.getByLabel("Display name").fill("Carol Runner");
  await page.getByLabel("Time zone").fill("Europe/London");
  await page.getByLabel("Bio").fill("Early mornings.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Carol Runner");
  await expect(page.getByLabel("Bio")).toHaveValue("Early mornings.");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Carol Runner", level: 3 })).toBeVisible();
});

test("an unknown time zone is rejected with a clear message", async ({ page }) => {
  await loginAs(page, "carol@e2e.test", MONDAY);
  await page.goto("/settings");
  await page.getByLabel("Time zone").fill("Mars/Olympus");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Unknown time zone");
});

test("AT-01 style: a member cannot edit (or read) another member's profile, and neither can the owner edit it", async ({ browser }) => {
  const base = test.info().project.use.baseURL;
  const open = async (email: string) => {
    const ctx = await browser.newContext({ baseURL: base });
    const page = await ctx.newPage();
    await loginAs(page, email, MONDAY);
    return { ctx, page };
  };
  const dave = await open("dave@e2e.test");
  const daveId = await meId(dave.page);

  const bob = await open("bob@e2e.test");
  const edit = await bob.page.request.patch(`/api/members/${daveId}/profile`, { data: { name: "HACKED" } });
  expect(edit.status()).toBe(403);
  expect((await bob.page.request.get(`/api/members/${daveId}/profile`)).status()).toBe(403);

  const owner = await open("owner@e2e.test");
  expect((await owner.page.request.patch(`/api/members/${daveId}/profile`, { data: { name: "HACKED" } })).status()).toBe(403); // owner reads, never edits
  const read = await owner.page.request.get(`/api/members/${daveId}/profile`);
  expect(read.status()).toBe(200);
  expect((await read.json()).name).toBe("Dave Member");

  expect((await (await dave.page.request.get("/api/profile")).json()).name).toBe("Dave Member"); // unchanged
  for (const c of [dave, bob, owner]) await c.ctx.close();
});

test("role escalation through the profile endpoint is rejected", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const res = await page.request.patch("/api/profile", { data: { role: "OWNER" } });
  expect(res.status()).toBe(400);
  expect((await (await page.request.get("/api/me")).json()).role).toBe("MEMBER");
});
