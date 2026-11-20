import { expect, test } from "@playwright/test";
import { hydrated, loginAs, MONDAY } from "./helpers";

test("the share page needs a session", async ({ page }) => {
  await page.goto("/progress/share");
  await expect(page).toHaveURL(/\/login/);
});

test("a member can preview, restyle and download a 1080 x 1920 story image of their day", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  await page.goto("/progress");
  await page.getByRole("link", { name: "Share story" }).click();
  await expect(page).toHaveURL(/\/progress\/share$/);
  await hydrated(page);

  const canvas = page.getByTestId("story-canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  expect(await canvas.evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([1080, 1920]);
  // it is really drawn (not a blank canvas): the centre-top region has more than one colour
  const colours = await canvas.evaluate((c) => {
    const ctx = (c as HTMLCanvasElement).getContext("2d")!;
    const seen = new Set<string>();
    for (let x = 0; x < 1080; x += 60) for (let y = 240; y < 1700; y += 60) seen.add(Array.from(ctx.getImageData(x, y, 1, 1).data).join(","));
    return seen.size;
  });
  expect(colours).toBeGreaterThan(8);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Show my numbers" }).click();
  await expect(page.getByRole("switch", { name: "Show my numbers" })).toHaveAttribute("aria-checked", "false");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download image" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^cadence-day-\d+\.png$/);
  const path = await download.path();
  const bytes = (await import("node:fs")).readFileSync(path!);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a member who has not started is pointed to Today instead", async ({ page }) => {
  await loginAs(page, "fresh@e2e.test", MONDAY);
  await page.goto("/progress/share");
  await expect(page.getByText("Start your 75 Hard first")).toBeVisible();
});
