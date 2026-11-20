import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY, SUNDAY } from "./helpers";

// T074: every screen is scanned with axe against WCAG 2.1 A and AA. Zero violations of ANY impact are allowed.
// (Colour contrast over the glass/gradient background is not resolvable by axe, so it is proven by the token
// contrast unit test, tests/unit/contrast.test.ts, against the darkest gradient stop.)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function scan(page: Page) {
  await page.waitForTimeout(900); // let entrance animations settle
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).disableRules(["color-contrast"]).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.html).join(" | ")}`);
}

const public_ = ["/login", "/forgot", "/reset?token=x", "/verify?token=x", "/signup", "/invite/not-a-token", "/install", "/offline", "/ui-preview"];
for (const path of public_) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    expect(await scan(page)).toEqual([]);
  });
}

test.describe("signed in", () => {
  test("axe: /today (normal day)", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today");
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /today (Sunday)", async ({ page }) => {
    await loginAs(page, "owner@e2e.test", SUNDAY);
    await page.goto("/today");
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /today (not started)", async ({ page }) => {
    await loginAs(page, "erin@e2e.test", MONDAY);
    // erin's programme exists; a member without one is covered by the dashboard 'You' tab below
    await page.goto("/today");
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /dashboard (Circle and You tabs)", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/dashboard");
    expect(await scan(page)).toEqual([]);
    await page.getByRole("tab", { name: "You" }).click();
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /dashboard You tab for a member with no programme", async ({ page }) => {
    await loginAs(page, "fresh@e2e.test", MONDAY);
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: "You" }).click();
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /progress", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/progress");
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /settings (member)", async ({ page }) => {
    await loginAs(page, "carol@e2e.test", MONDAY);
    await page.goto("/settings");
    expect(await scan(page)).toEqual([]);
  });
  test("axe: /settings (owner, with Circle admin and a new invite link)", async ({ page }) => {
    await loginAs(page, "owner@e2e.test", MONDAY);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.getByLabel("Invite link", { exact: true })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
  test("axe: the Day 75 celebration", async ({ page }) => {
    await loginAs(page, "bob@e2e.test", "2027-01-14T06:00:00Z");
    await page.goto("/today");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
});

// Keyboard users must always be able to see where they are: every focusable element gets a visible outline.
async function focusRingProblems(page: Page, maxStops = 60) {
  const problems: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (el.tagName.toLowerCase() === "nextjs-portal") return { visible: true, label: "dev overlay", hidden: true }; // Next dev-mode overlay, absent in production
      const cs = getComputedStyle(el);
      const visible = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor !== "rgba(0, 0, 0, 0)";
      const boxRing = cs.boxShadow !== "none" && /rgba?\(/.test(cs.boxShadow) && cs.boxShadow.includes("0px 0px 0px");
      return { visible: visible || boxRing, label: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`, hidden: el.className?.toString().includes("sr-only") ?? false };
    });
    if (!info) break;
    if (!info.visible && !info.hidden) problems.push(info.label);
  }
  return [...new Set(problems)];
}

test.describe("visible keyboard focus", () => {
  for (const path of ["/login", "/forgot", "/install", "/ui-preview"]) {
    test(`every focusable element on ${path} shows a focus ring`, async ({ page }) => {
      await page.goto(path);
      expect(await focusRingProblems(page)).toEqual([]);
    });
  }
  test("on /today, /dashboard, /progress and /settings", async ({ page }) => {
    await loginAs(page, "owner@e2e.test", MONDAY);
    for (const path of ["/today", "/dashboard", "/progress", "/settings"]) {
      await page.goto(path);
      expect(await focusRingProblems(page, 90), path).toEqual([]);
    }
  });
});

test("every form control has a programmatic label (inputs, selects, textareas)", async ({ page }) => {
  await loginAs(page, "owner@e2e.test", MONDAY);
  for (const path of ["/login", "/forgot", "/today", "/settings"]) {
    await page.goto(path);
    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter((el) => {
          const e = el as HTMLInputElement;
          return !(e.labels && e.labels.length) && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby");
        })
        .map((el) => (el as HTMLElement).outerHTML.slice(0, 80)),
    );
    expect(unlabeled, path).toEqual([]);
  }
});
