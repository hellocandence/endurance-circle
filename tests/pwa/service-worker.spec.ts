import { expect, test, type Page } from "@playwright/test";

const ready = (page: Page) =>
  page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.ready).active!;
    if (worker.state !== "activated") await new Promise<void>((r) => worker.addEventListener("statechange", () => worker.state === "activated" && r()));
    return worker.state;
  });

/** Wait until the worker controls this page (it claims clients on activation). */
async function controlled(page: Page) {
  await page.goto("/login");
  expect(await ready(page)).toBe("activated");
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

const cachedUrls = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });

test("the service worker installs, activates and takes control", async ({ page }) => {
  await controlled(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/sw\.js$/);
});

test("it precaches the offline page and the static app shell", async ({ page }) => {
  await controlled(page);
  const urls = await cachedUrls(page);
  expect(urls).toContain("/offline");
  expect(urls.some((u) => u.startsWith("/_next/static/"))).toBe(true);
});

test("with no network, opening the app shows the shell and an offline message", async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.goto("/dashboard"); // a page that was never visited, so only the fallback can answer
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No connection");
  await expect(page.getByText("Cadence", { exact: true })).toBeVisible(); // branded shell, styled (not a browser error page)
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/login"); // a page that WAS visited online: still the offline page, since HTML is never cached
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});

test("coming back online recovers by itself: the app carries on to the page that was requested", async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.goto("/dashboard");
  await expect(page.getByRole("status")).toContainText("No connection");
  await context.setOffline(false);
  // Next re-requests /dashboard now that the network is back; this visitor is signed out, so it lands on login
  await page.waitForURL("**/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("private data is never stored on the device: no API responses, pages or photos in any cache", async ({ page }) => {
  await controlled(page);
  for (const path of ["/login", "/forgot", "/offline"]) await page.goto(path);
  await page.request.get("/api/health"); // API traffic must not be cached either
  await page.evaluate(() => fetch("/api/health"));
  await page.waitForTimeout(500);
  const urls = await cachedUrls(page);
  expect(urls.filter((u) => u.startsWith("/api/"))).toEqual([]);
  const documents = urls.filter((u) => !u.startsWith("/_next/") && !/\.(png|svg|ico|webp|woff2?|css|js)$/.test(u));
  expect(documents).toEqual(["/offline"]); // the offline page is the only HTML that is kept
});
