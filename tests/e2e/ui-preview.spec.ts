import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("/ui-preview", () => {
  test("shows every design-system component", async ({ page }) => {
    await page.goto("/ui-preview");
    await expect(page.getByRole("heading", { name: "GlassCard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Daily goal, 6 of 8 done" })).toHaveAttribute(
      "aria-valuenow",
      "75",
    );
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  test("has no color-contrast violations", async ({ page }) => {
    await page.goto("/ui-preview");
    await page.waitForTimeout(1200); // let entry animations finish so axe reads final colours
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test("tab bar sits at the bottom on phones", async ({ page }) => {
    await page.goto("/ui-preview");
    const box = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 40);
    expect(box!.width).toBeGreaterThan(viewport.width - 40);
  });
});
