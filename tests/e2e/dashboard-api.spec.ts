import { expect, test } from "@playwright/test";
import { MEMBER_COUNT } from "./setup/constants";
import { loginAs, MONDAY } from "./helpers";

test("AT-05: the public feed needs a session", async ({ request }) => {
  expect((await request.get("/api/dashboard/public")).status()).toBe(401);
});

test("AT-03: the public feed carries no body metrics or private notes", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  // give Alice something private to protect (own data)
  await page.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "PRIVATE-CANARY-77", updateText: "public line" } });

  await loginAs(page, "bob@e2e.test", MONDAY); // a different member reads the feed
  const res = await page.request.get("/api/dashboard/public");
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).not.toContain("PRIVATE-CANARY-77");
  expect(text).not.toMatch(/weight|height|proteinG|proteinTarget|proteinMultiplier|privateNotes|email|passwordHash/i);

  const body = JSON.parse(text);
  expect(body.members.length).toBeGreaterThanOrEqual(MEMBER_COUNT);
  expect(body.members.filter((m: { isMe: boolean }) => m.isMe)).toHaveLength(1);
  expect(body.pulse.memberCount).toBe(body.members.length);
});
