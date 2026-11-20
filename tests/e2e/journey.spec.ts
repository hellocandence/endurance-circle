import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY } from "./helpers";

const userId = async (page: Page) => (await (await page.request.get("/api/me")).json()).id as string;

test("AT-05: journey routes need a session", async ({ request }) => {
  expect((await request.get("/api/journey/me")).status()).toBe(401);
  expect((await request.get("/api/members/00000000-0000-4000-8000-000000000000/journey")).status()).toBe(401);
});

test("a member reads their own journey, including private notes", async ({ page }) => {
  await loginAs(page, "carol@e2e.test", MONDAY);
  await page.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "CAROL-PRIVATE-NOTE", runKm: 5 } });
  const res = await page.request.get("/api/journey/me");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ownerId).toBe(await userId(page));
  expect(body.logs.find((l: { logDate: string }) => l.logDate === "2026-11-23").privateNotes).toBe("CAROL-PRIVATE-NOTE");
  expect(body.stats).toHaveProperty("window");
  expect(body.programme.dayNumber).toBe(23);
});

test("AT-02: a member cannot read another member's private journey", async ({ browser }) => {
  const aliceCtx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const alice = await aliceCtx.newPage();
  await loginAs(alice, "alice@e2e.test", MONDAY);
  await alice.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "ALICE-SECRET-FOR-AT02" } });
  const aliceId = await userId(alice);

  const bobCtx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const bob = await bobCtx.newPage();
  await loginAs(bob, "bob@e2e.test", MONDAY);
  const res = await bob.request.get(`/api/members/${aliceId}/journey`);
  expect(res.status()).toBe(403);
  expect(await res.text()).not.toContain("ALICE-SECRET-FOR-AT02");
  // an id that does not exist is also 403 for members (no way to probe which ids exist)
  expect((await bob.request.get("/api/members/00000000-0000-4000-8000-000000000000/journey")).status()).toBe(403);
  expect((await bob.request.get("/api/members/not-a-uuid/journey")).status()).toBe(403);

  // Bob's own journey never contains Alice's data
  const mine = await bob.request.get("/api/journey/me");
  expect(await mine.text()).not.toContain("ALICE-SECRET-FOR-AT02");
  await aliceCtx.close();
  await bobCtx.close();
});

test("the owner can read any member's journey (AT-04 style)", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  await page.request.put("/api/tracker/2026-11-23", { data: { runKm: 5 } });
  const aliceId = await userId(page);

  await loginAs(page, "owner@e2e.test", MONDAY);
  const res = await page.request.get(`/api/members/${aliceId}/journey`);
  expect(res.status()).toBe(200);
  expect((await res.json()).ownerId).toBe(aliceId);
  expect((await page.request.get("/api/members/00000000-0000-4000-8000-000000000000/journey")).status()).toBe(404);
  expect((await page.request.get("/api/members/not-a-uuid/journey")).status()).toBe(404);
});
