import { expect, test } from "@playwright/test";

test("home page shows the Cadence name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cadence" })).toBeVisible();
});

test("home page links signed-out visitors to the sign-in page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});
