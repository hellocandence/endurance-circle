import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

test("the install guide is public and explains both platforms (375px)", async ({ page }) => {
  await page.goto("/install");
  expect(page.viewportSize()!.width).toBe(375);
  await expect(page.getByRole("heading", { name: "Add Endurance Circle to your phone" })).toBeVisible();
  const ios = page.getByRole("region", { name: "iPhone and iPad" });
  await expect(ios).toContainText("Share");
  await expect(ios).toContainText("Add to Home Screen");
  await expect(ios).toContainText("Safari");
  const android = page.getByRole("region", { name: "Android" });
  await expect(android).toContainText("Install app");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test("on an iPhone the iOS steps come first and are marked as the user's device", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE_SAFARI, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/install");
  const first = page.locator("[data-platform]").first();
  await expect(first).toHaveAttribute("data-platform", "ios");
  await expect(first).toContainText("Your device");
  await expect(page.locator("main [role=alert]")).toHaveCount(0); // Safari is fine
  await ctx.close();
});

test("an iPhone browser other than Safari is told to switch", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE_CHROME, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/install");
  await expect(page.locator("main [role=alert]")).toContainText("Open this page in Safari");
  await ctx.close();
});

test("on Android the browser's install prompt becomes an Install button", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: ANDROID_CHROME, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/install");
  await expect(page.locator("[data-platform]").first()).toHaveAttribute("data-platform", "android");
  await expect(page.getByRole("button", { name: "Install app" })).toHaveCount(0); // nothing to offer until the browser says so

  // Chrome fires this when the app is installable; simulate it, including the prompt() contract
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    (window as unknown as { __prompted: boolean }).__prompted = false;
    e.prompt = async () => { (window as unknown as { __prompted: boolean }).__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  await page.getByRole("button", { name: "Install app" }).click();
  expect(await page.evaluate(() => (window as unknown as { __prompted: boolean }).__prompted)).toBe(true);
  await expect(page.getByRole("status")).toContainText("Installing");
  await ctx.close();
});

test("the guide is linked from the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Add Endurance Circle to your phone" }).click();
  await page.waitForURL("**/install");
});
