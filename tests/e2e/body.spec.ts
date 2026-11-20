import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY } from "./helpers";

const meId = async (page: Page) => (await (await page.request.get("/api/me")).json()).id as string;

test("AT-05: body routes need a session", async ({ request }) => {
  expect((await request.get("/api/body")).status()).toBe(401);
  expect((await request.patch("/api/body", { data: { weightKg: 70 } })).status()).toBe(401);
});

test("AT-01 and AT-04: other members get 403, the owner can read, nobody but the member can edit", async ({ browser }) => {
  const base = test.info().project.use.baseURL;
  const open = async (email: string) => {
    const ctx = await browser.newContext({ baseURL: base });
    const page = await ctx.newPage();
    await loginAs(page, email, MONDAY);
    return { ctx, page };
  };
  const dave = await open("dave@e2e.test");
  const daveId = await meId(dave.page);

  const bob = await open("bob@e2e.test"); // AT-01: member A requests member B's body metrics
  const denied = await bob.page.request.get(`/api/members/${daveId}/body`);
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toMatch(/75|weight/i);
  expect((await bob.page.request.patch(`/api/members/${daveId}/body`, { data: { weightKg: 50 } })).status()).toBe(403);
  expect((await bob.page.request.get("/api/members/00000000-0000-4000-8000-000000000000/body")).status()).toBe(403); // cannot probe ids

  const owner = await open("owner@e2e.test"); // AT-04: owner requests any member's body metrics
  const allowed = await owner.page.request.get(`/api/members/${daveId}/body`);
  expect(allowed.status()).toBe(200);
  expect(await allowed.json()).toMatchObject({ userId: daveId, weightKg: 75, proteinTargetG: 90 });
  expect((await owner.page.request.patch(`/api/members/${daveId}/body`, { data: { weightKg: 50 } })).status()).toBe(403); // read, never edit

  expect((await (await dave.page.request.get("/api/body")).json()).weightKg).toBe(75); // untouched
  for (const c of [dave, bob, owner]) await c.ctx.close();
});

test("a member edits their own limits and the protein target recalculates", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const res = await page.request.patch("/api/body", { data: { weightKg: 80, proteinMultiplier: 1.2, studyMinTarget: 75 } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ weightKg: 80, proteinTargetG: 96, studyMinTarget: 75 });
  await page.request.patch("/api/body", { data: { weightKg: 75, studyMinTarget: 60 } }); // restore
});

test("invalid limits are rejected (study 60 to 90, strict fields)", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  for (const data of [{ studyMinTarget: 59 }, { studyMinTarget: 91 }, { weightKg: 5 }, { role: "OWNER" }, { userId: "x" }]) {
    expect((await page.request.patch("/api/body", { data })).status(), JSON.stringify(data)).toBe(400);
  }
});

test("Settings shows the limits form with a live protein target", async ({ page }) => {
  await loginAs(page, "carol@e2e.test", MONDAY);
  await page.goto("/settings");
  expect(page.viewportSize()!.width).toBe(375);
  await expect(page.getByText("Private: only you and the circle owner can see these.")).toBeVisible();
  await expect(page.getByText("Protein target: 72 g a day")).toBeVisible(); // 60 kg × 1.2
  await page.getByLabel("Weight").fill("65");
  await expect(page.getByText("Protein target: 78 g a day")).toBeVisible();
  await page.getByLabel("Protein multiplier").fill("1.6");
  await expect(page.getByText("Protein target: 104 g a day")).toBeVisible();
  await page.getByLabel("Study target").fill("95");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByRole("region", { name: "Body limits" }).locator("input:invalid")).toHaveCount(1); // 95 is out of range: the browser stops it (the server also rejects it, see above)
  await expect(page.getByText("Limits saved.")).toHaveCount(0);
  await page.getByLabel("Study target").fill("80");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Limits saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Weight")).toHaveValue("65");
  await expect(page.getByLabel("Study target")).toHaveValue("80");
  await expect(page.getByText("Protein target: 104 g a day")).toBeVisible();
});

test("a member's limits never appear in the circle feed or on other members' pages", async ({ page }) => {
  await loginAs(page, "bob@e2e.test", MONDAY);
  const feed = await (await page.request.get("/api/dashboard/public")).text();
  expect(feed).not.toMatch(/weightKg|heightCm|protein|waterTarget|runTarget|studyMinTarget/i);
  await page.goto("/dashboard");
  expect(await page.locator("main").innerText()).not.toMatch(/\bkg\b|protein target|weight/i);
});
