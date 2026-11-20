import { expect, test } from "@playwright/test";

// The production build has a stricter policy than dev (no 'unsafe-eval', upgrade-insecure-requests), so the
// app must be proven to still hydrate, run and register its service worker under exactly that policy.
test("the production policy is stricter than dev and the app still runs under it", async ({ page, request }) => {
  const res = await request.get("/login");
  const csp = res.headers()["content-security-policy"];
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toContain("ws:");
  expect(csp).toContain("upgrade-insecure-requests");
  expect(res.headers()["strict-transport-security"]).toMatch(/max-age=63072000/);

  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) violations.push(m.text().slice(0, 160)); });
  await page.addInitScript(() => {
    (window as unknown as { __v: string[] }).__v = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(e.violatedDirective));
  });

  await page.goto("/login");
  // JavaScript really executed (hydration): the show/hide button toggles the password field
  await page.getByLabel("Password").fill("a-password");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "text");

  // the service worker registers and activates under the policy
  await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
  await page.goto("/install");
  await page.goto("/ui-preview");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __v: string[] }).__v)).toEqual([]);
  expect(violations).toEqual([]);
});

test("an injected script cannot run in production either", async ({ page }) => {
  await page.goto("/login");
  const ran = await page.evaluate(() => {
    (window as unknown as { __x: boolean }).__x = false;
    const s = document.createElement("script");
    s.textContent = "window.__x = true";
    document.body.appendChild(s);
    return (window as unknown as { __x: boolean }).__x;
  });
  expect(ran).toBe(false);
});

test("the service worker script is always revalidated", async ({ request }) => {
  const h = (await request.get("/sw.js")).headers();
  expect(h["cache-control"]).toMatch(/no-cache|no-store/);
  expect(h["service-worker-allowed"]).toBe("/");
});
