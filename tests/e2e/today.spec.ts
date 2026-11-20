import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY, SUNDAY } from "./helpers";

const ring = (page: Page) => page.getByRole("progressbar");
const waitSaved = (page: Page) => expect(page.getByText("Saved", { exact: true })).toBeVisible();
const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

/** First number of the ring's stroke-dasharray (pathLength is normalised to 1, so this is the filled fraction). */
const filled = (page: Page) =>
  page.evaluate(() => {
    const circle = document.querySelectorAll('[role="progressbar"] circle')[1] as SVGCircleElement;
    return parseFloat(getComputedStyle(circle).strokeDasharray.split(/[ ,]+/)[0] || "0");
  });

test("a signed-out visitor is sent to the login page", async ({ page }) => {
  await page.goto("/today");
  await page.waitForURL("**/login");
});

test.describe("normal day (Monday, day 23)", () => {
  test.describe.configure({ mode: "serial" });

  test("shows the day, the required tasks and the protein target", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today");
    expect(page.viewportSize()!.width).toBe(375);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 23");
    await expect(page.getByText("of 75")).toBeVisible();
    await expect(page.getByText("Sunday: recovery day")).toHaveCount(0);
    for (const title of ["Run", "Warm-up before the run", "Cool-down after the run", "Water", "Electrolytes", "Protein", "Study", "Tech note", "GitHub contribution", "Satsang or reading"]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("group", { name: /^Stretching/ })).toContainText("Optional");
    await expect(page.getByText("Your target is 84 g")).toBeVisible();
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "0");
    await expect(ring(page)).toHaveAttribute("aria-label", "0 of 10 tasks done");
    await noHorizontalScroll(page);
  });

  test("the progress ring animates as tasks are completed", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today");
    expect(await filled(page)).toBe(0);

    await page.getByRole("button", { name: "Log 5 km" }).click();
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "10");
    await page.waitForTimeout(150);
    const mid = await filled(page); // part-way through the 0.9 s animation
    await page.waitForTimeout(1200);
    const end = await filled(page);
    expect(end).toBeCloseTo(0.1, 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(end);
    await waitSaved(page);
  });

  test("respects reduced motion (the ring jumps straight to its value)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today"); // run (10%) was saved by the previous test
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "10");
    await page.getByRole("switch", { name: /Warm-up/ }).first().click();
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "20");
    await page.waitForTimeout(100); // one frame to apply; with motion enabled it would still be tweening (see the test above)
    expect(await filled(page)).toBeCloseTo(0.2, 2); // no tween: already at the final value
  });

  test("completing everything completes the day, and it persists across reloads", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today");
    await page.getByRole("button", { name: "Log 5 km" }).click();
    for (const name of [/Warm-up$/, /Cool-down$/, /Electrolytes/, /Committed or opened a PR/]) {
      const sw = page.getByRole("switch", { name });
      if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
    }
    await page.getByRole("spinbutton", { name: "Water", exact: true }).fill("3");
    await page.getByRole("spinbutton", { name: "Protein", exact: true }).fill("83");
    await expect(page.getByRole("group", { name: /^Protein/ })).toHaveAttribute("data-done", "false"); // 83 < 84
    await page.getByRole("spinbutton", { name: "Protein", exact: true }).fill("84");
    await page.getByLabel("Study time").fill("60");
    await page.getByLabel("One useful, implementable tip").fill("Use partial indexes for hot queries");
    await page.getByRole("spinbutton", { name: "Time", exact: true }).fill("20");

    await expect(page.getByRole("status").filter({ hasText: "Day complete" })).toBeVisible();
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "100");
    await waitSaved(page);

    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Day complete" })).toBeVisible();
    await expect(page.getByLabel("One useful, implementable tip")).toHaveValue("Use partial indexes for hot queries");
    await expect(page.getByRole("spinbutton", { name: "Protein", exact: true })).toHaveValue("84");
  });

  test("public and private notes are labelled honestly and persist", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today");
    await expect(page.getByText("Public: everyone in the circle sees this line.")).toBeVisible();
    await expect(page.getByText("Visible to you and the circle owner only.")).toBeVisible();
    await page.getByLabel("Update for the circle").fill("Day 23 done");
    await page.getByLabel("Private note").fill("knee felt tight");
    await waitSaved(page);
    await page.reload();
    await expect(page.getByLabel("Private note")).toHaveValue("knee felt tight");
  });

  test("is keyboard accessible and passes axe (serious and critical)", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/today");
    await page.getByLabel("Distance").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Log 5 km" })).toBeFocused();
    await page.waitForTimeout(800);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });
});

test.describe("Sunday", () => {
  test("stretching is required, running and warm-ups are not (AT-09)", async ({ page }) => {
    await loginAs(page, "owner@e2e.test", SUNDAY);
    await page.goto("/today");
    await expect(page.getByText("Sunday: recovery day")).toBeVisible();
    await expect(page.getByRole("group", { name: /^Stretching/ })).toContainText("Required today");
    for (const title of ["Run", "Warm-up before the run", "Cool-down after the run"]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
    }
    await expect(ring(page)).toHaveAttribute("aria-label", "0 of 8 tasks done");

    await page.getByRole("button", { name: "Log 25 min" }).click();
    await expect(ring(page)).toHaveAttribute("aria-label", "1 of 8 tasks done");
    await noHorizontalScroll(page);
  });

  test("a Sunday completes with stretching only", async ({ page }) => {
    await loginAs(page, "owner@e2e.test", SUNDAY);
    await page.goto("/today");
    await page.getByRole("button", { name: "Log 25 min" }).click();
    await page.getByRole("switch", { name: /Electrolytes/ }).click();
    await page.getByRole("switch", { name: /Committed or opened a PR/ }).click();
    await page.getByRole("spinbutton", { name: "Water", exact: true }).fill("3");
    await page.getByRole("spinbutton", { name: "Protein", exact: true }).fill("100");
    await page.getByLabel("Study time").fill("75");
    await page.getByLabel("One useful, implementable tip").fill("tip");
    await page.getByRole("spinbutton", { name: "Time", exact: true }).fill("15");
    await expect(page.getByRole("status").filter({ hasText: "Day complete" })).toBeVisible();
    await waitSaved(page);
  });
});

test("a new member can start their 75 Hard (Day 1 begins today)", async ({ page }) => {
  await loginAs(page, "fresh@e2e.test", MONDAY);
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Ready to begin?" })).toBeVisible();
  await page.getByRole("button", { name: "Start my 75 Hard" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 1");
  await expect(page.getByText("Add your weight in Settings")).toBeVisible();
});

test.describe("Day 75", () => {
  const DAY_75 = "2027-01-14T06:00:00Z"; // programme started 2026-11-01, so this is day 75
  const DAY_74 = "2027-01-13T06:00:00Z";

  test("the celebration appears when the day number reaches 75, with a summary", async ({ page }) => {
    await loginAs(page, "bob@e2e.test", DAY_75);
    // log a complete day so the summary has something in it
    const done = { runKm: 5, warmupPreDone: true, warmupPostDone: true, waterL: 3, electrolytesDone: true, proteinG: 120, studyMin: 60, techNote: "t", githubContribution: true, readingMin: 10 };
    expect((await page.request.put("/api/tracker/2027-01-14", { data: done })).status()).toBe(200);

    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 75");
    const dialog = page.getByRole("dialog", { name: /Day 75/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Days completed").locator("..")).toContainText("1/75");
    await expect(dialog.getByText("Best run").locator("..")).toContainText("1 days");
    await noHorizontalScroll(page);

    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Water", exact: true })).toBeVisible(); // checklist is still there
  });

  test("it does not appear on day 74", async ({ page }) => {
    await loginAs(page, "bob@e2e.test", DAY_74);
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Day 74");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
