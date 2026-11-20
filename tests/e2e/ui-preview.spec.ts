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

test.describe("hover (desktop pointer)", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 800 } });

  test("interactive cards and buttons lift on hover", async ({ page }) => {
    await page.goto("/ui-preview");
    const translateOf = (loc: ReturnType<typeof page.locator>) => loc.evaluate((el) => getComputedStyle(el).translate);
    for (const target of [page.getByRole("button", { name: "Primary" }), page.getByRole("button", { name: /Interactive card/ })]) {
      await target.scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      await expect.poll(() => translateOf(target)).toBe("none");
      await target.hover();
      await expect.poll(() => translateOf(target)).toMatch(/-2px/);
    }
  });
});
