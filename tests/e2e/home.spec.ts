import { expect, test } from "@playwright/test";

test("home page shows the Endurance Circle name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Endurance Circle" })).toBeVisible();
});

test("home page links signed-out visitors to the sign-in page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("privacy and terms pages are public", async ({ page }) => {
  for (const [path, heading] of [["/privacy", "Privacy"], ["/terms", "Terms"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
});
