import { expect, test, type Page } from "@playwright/test";

/** Samples a CSS property of an element on every animation frame for `ms` milliseconds. */
const sample = (page: Page, selector: string, prop: "opacity" | "transform", ms: number) =>
  page.evaluate(
    ([sel, p, duration]) =>
      new Promise<string[]>((resolve) => {
        const out: string[] = [];
        const start = performance.now();
        const tick = () => {
          const el = document.querySelector(sel as string);
          if (el) out.push(getComputedStyle(el)[p as "opacity" | "transform"]);
          if (performance.now() - start < (duration as number)) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    [selector, prop, ms] as const,
  );

/** "none" and an identity matrix both mean "not moved". */
const still = (t: string) => t === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t);
const scaleOf = (matrix: string) => (matrix === "none" ? 1 : Number(matrix.match(/matrix\(([^,]+)/)?.[1] ?? 1));

test.describe("card press spring", () => {
  test("an interactive card shrinks while pressed and springs back", async ({ page }) => {
    await page.goto("/ui-preview");
    const card = page.getByRole("button", { name: /Interactive card/ });
    await page.waitForTimeout(500); // let the entrance finish
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const pressed = scaleOf(await card.evaluate((el) => getComputedStyle(el).transform));
    expect(pressed).toBeLessThan(0.995);
    expect(pressed).toBeGreaterThan(0.95);
    await page.mouse.up();
    await page.waitForTimeout(700);
    expect(scaleOf(await card.evaluate((el) => getComputedStyle(el).transform))).toBeCloseTo(1, 2);
  });

  test("buttons press too", async ({ page }) => {
    await page.goto("/ui-preview");
    const btn = page.getByRole("button", { name: "Primary" });
    const box = (await btn.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    expect(scaleOf(await btn.evaluate((el) => getComputedStyle(el).transform))).toBeLessThan(0.99);
    await page.mouse.up();
  });
});

test.describe("page transitions", () => {
  test("a new page fades and rises in", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(500);
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    // Watch long enough to cover a slow first navigation (the dev server compiles the route on first visit):
    // the old page stays at opacity 1, then the new page's wrapper fades in from 0 to 1.
    const opacities = (await sample(page, '[data-testid="page-transition"]', "opacity", 3000)).map(Number);
    expect(Math.min(...opacities)).toBeLessThan(0.95); // it really animated...
    expect(opacities.at(-1)).toBe(1); // ...and finished fully visible
    const fromStart = opacities.slice(opacities.indexOf(Math.min(...opacities))); // (earlier samples are the outgoing page)
    expect(fromStart).toEqual([...fromStart].sort((a, b) => a - b)); // fading in, never flickering
  });

  test("with reduced motion pages appear at once, with no movement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await page.waitForTimeout(300);
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.waitForURL("**/forgot");
    // with reduced motion there is no wrapper animation at all: the content is simply there
    await expect(page.locator('[data-testid="page-transition"]')).toHaveCount(0);
    const opacities = (await sample(page, "main", "opacity", 300)).map(Number);
    expect(opacities.every((o) => o === 1)).toBe(true);
    const transforms = await sample(page, "main", "transform", 200);
    expect(transforms.every(still)).toBe(true);
  });
});

test("reduced motion: cards and the ring do not move or tween", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui-preview");
  const transforms = await sample(page, "[role=button]", "transform", 300);
  expect([...new Set(transforms.filter((t) => !still(t)))]).toEqual([]);
  // the animation CSS is also neutralised for anything that uses transitions
  const duration = await page.getByRole("button", { name: "Primary" }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
});
