import { expect, test } from "@playwright/test";
import { hydrated, loginAs, MONDAY } from "./helpers";

test("EC AI routes need a session; the tick needs the secret", async ({ request }) => {
  for (const url of ["/api/ec/me", "/api/ec/group"]) expect((await request.get(url)).status(), url).toBe(401);
  expect((await request.put("/api/ec/me", { data: { enabled: true } })).status()).toBe(401);
  expect((await request.post("/api/ec/test")).status()).toBe(401);
  expect((await request.post("/api/ec/tick")).status()).toBe(401);
  expect((await request.post("/api/ec/tick", { headers: { "x-cron-secret": "wrong" } })).status()).toBe(401);
});

test("a member sets a number and a 3-hourly schedule; the group reminder is read-only for them", async ({ page }) => {
  await loginAs(page, "carol@e2e.test", MONDAY);
  await page.goto("/ec-ai");
  await hydrated(page);
  expect(page.viewportSize()!.width).toBe(375);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "EC AI" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Save group reminder" })).toHaveCount(0);

  await page.getByLabel("Your WhatsApp number").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Fill the times" }).click();
  await expect(page.getByText("Reminder times (5/12)")).toBeVisible();
  await page.getByRole("switch", { name: "Send me reminders" }).click();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  const saved = await (await page.request.get("/api/ec/me")).json();
  expect(saved).toMatchObject({ whatsappNumber: "919876543210", enabled: true, times: ["08:00", "11:00", "14:00", "17:00", "20:00"] });
});

test("a member cannot change the group reminder or read another member's settings", async ({ page }) => {
  await loginAs(page, "carol@e2e.test", MONDAY);
  expect((await page.request.put("/api/ec/group", { data: { enabled: true, time: "21:00" } })).status()).toBe(403);
  expect((await page.request.put("/api/ec/me", { data: { role: "OWNER" } })).status()).toBe(400);
  expect((await page.request.put("/api/ec/me", { data: { whatsappNumber: "12" } })).status()).toBe(400);
});

test("the owner sets the group reminder time and sees the circle overview without numbers", async ({ page }) => {
  await loginAs(page, "owner@e2e.test", MONDAY);
  await page.goto("/ec-ai");
  await hydrated(page);
  await page.getByRole("switch", { name: "Daily group reminder" }).click();
  await page.getByLabel("Time (your time zone)").fill("20:30");
  await page.getByRole("button", { name: "Save group reminder" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Group reminder saved." })).toBeVisible();
  expect(await (await page.request.get("/api/ec/group")).json()).toMatchObject({ enabled: true, time: "20:30" });
  await expect(page.getByRole("region", { name: "Circle reminders" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Circle reminders" })).not.toContainText("919876543210");
});
