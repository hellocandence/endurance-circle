import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MEMBER_COUNT } from "./setup/constants";
import { hydrated, loginAs, MONDAY } from "./helpers";

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

/** A touch drag at the top of the page, dispatched like a finger would. */
const pull = (page: Page, distance: number) =>
  page.evaluate((d) => {
    const touch = (y: number) => new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: y });
    const fire = (type: string, y?: number) =>
      window.dispatchEvent(new TouchEvent(type, { touches: y === undefined ? [] : [touch(y)], bubbles: true, cancelable: true }));
    fire("touchstart", 100);
    fire("touchmove", 100 + d);
    fire("touchend");
  }, distance);

test("a signed-out visitor is sent to login", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL("**/login");
});

test.describe("circle tab", () => {
  test("shows the circle pulse and a card for every member, with 'You' marked", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/dashboard");
    expect(page.viewportSize()!.width).toBe(375);

    await expect(page.getByRole("heading", { name: "Endurance Circle", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Circle pulse" })).toBeVisible();
    const members = page.getByRole("list", { name: "Members" }).locator(":scope > li"); // (each card also holds a list of task chips)
    await expect(members).toHaveCount(MEMBER_COUNT);
    for (const name of ["Olivia Owner", "Alice Member", "Bob Member", "Fresh Member"]) {
      await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
    }
    await expect(page.getByRole("group", { name: "Alice Member (you)" })).toContainText("You");
    await expect(page.getByRole("group", { name: "Fresh Member" })).toContainText("Not started");
    await expect(page.getByRole("group", { name: "Bob Member" })).toContainText("Day 23");
    await noHorizontalScroll(page);
  });

  test("never shows anyone's body metrics or private notes", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "DASH-PRIVATE-CANARY", updateText: "visible to all" } });
    await loginAs(page, "bob@e2e.test", MONDAY);
    await page.goto("/dashboard");
    await expect(page.getByText("visible to all")).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("DASH-PRIVATE-CANARY"); // not even hidden in the markup or the page data
    const visible = await page.locator("main").innerText();
    expect(visible).not.toMatch(/weight|\bkg\b|height|protein target/i);
  });
});

test.describe("tabs", () => {
  test("Circle and You switch with the keyboard (arrow keys)", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/dashboard");
    const circle = page.getByRole("tab", { name: "Circle" });
    const you = page.getByRole("tab", { name: "You" });
    await expect(circle).toHaveAttribute("aria-selected", "true");
    await circle.focus();
    await page.keyboard.press("ArrowRight");
    await expect(you).toBeFocused();
    await expect(you).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Only you and the circle owner can see this tab.");
    await page.keyboard.press("ArrowLeft");
    await expect(circle).toHaveAttribute("aria-selected", "true");
  });

  test("the You tab shows only the member's own journey", async ({ page }) => {
    await loginAs(page, "bob@e2e.test", MONDAY);
    await page.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "BOB-OWN-NOTE", runKm: 5 } });
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: "You" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText(/Day\s*23 \/ 75/);
    await expect(panel).toContainText("Private: BOB-OWN-NOTE");
    await expect(panel).not.toContainText("ALICE");
  });

  test("a member with no programme is invited to start one", async ({ page }) => {
    await loginAs(page, "fresh@e2e.test", MONDAY);
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: "You" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Start your 75 Hard");
  });
});

test.describe("refresh", () => {
  test("pulling down at the top refreshes the data", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const refreshed = page.waitForRequest((r) => r.url().includes("/dashboard") && r.url().includes("_rsc"));
    await pull(page, 140);
    await refreshed;
  });

  test("a short pull does nothing", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    let requested = false;
    page.on("request", (r) => { if (r.url().includes("_rsc")) requested = true; });
    await pull(page, 40);
    await page.waitForTimeout(600);
    expect(requested).toBe(false);
  });

  test("the Refresh button does the same for keyboard users", async ({ page }) => {
    await loginAs(page, "alice@e2e.test", MONDAY);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const refreshed = page.waitForRequest((r) => r.url().includes("_rsc"));
    await page.getByRole("button", { name: "Refresh dashboard" }).click();
    await refreshed;
  });
});

test("respects reduced motion and passes axe (serious and critical)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAs(page, "alice@e2e.test", MONDAY);
  await page.goto("/dashboard");
  await page.waitForTimeout(600);
  // with reduced motion the cards are in place straight away (no slide-in transform)
  const transforms = await page.locator("ul[aria-label=Members] li > div").evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
  expect(transforms.every((t) => t === "none")).toBe(true);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test("the circle shows each member's tasks for today and who has done what", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  await page.goto("/dashboard");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "Who has done what today" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Today's activity" }).getByRole("listitem").first()).toBeVisible();
  const mine = page.getByRole("list", { name: "Alice Member's tasks today" });
  await expect(mine.getByRole("listitem")).toHaveCount(10); // a normal Monday
  // task names only: no amounts, notes or body numbers anywhere in the feed
  const feed = await page.request.get("/api/dashboard/public");
  expect(JSON.stringify(await feed.json())).not.toMatch(/weight|privateNotes|proteinG|waterL|runKm|email/i);
});

test("the day-by-day grid keeps small squares on day 1 (only one day of data)", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", "2026-11-01T06:00:00Z"); // every programme started on the 1st
  await page.goto("/dashboard");
  await hydrated(page);
  const cells = page.getByRole("gridcell");
  await expect(cells.first()).toBeVisible();
  const box = (await cells.first().boundingBox())!;
  expect(box.width).toBeLessThan(40);
  expect(box.height).toBeLessThan(40);
  await expect(page.getByText("Every member, today.")).toBeVisible();
  await noHorizontalScroll(page);
});
