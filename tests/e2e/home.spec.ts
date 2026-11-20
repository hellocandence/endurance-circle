import { expect, test } from "@playwright/test";

test("home page shows the Cadence name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cadence" })).toBeVisible();
});
