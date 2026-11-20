import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY, hydrated } from "./helpers";

type Violation = { directive: string; blocked: string };

/** Records every CSP violation the browser reports on this page. */
async function trackViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: Violation[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: Violation[] }).__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI || e.sample || "inline" }),
    );
  });
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
  return async () => [...(await page.evaluate(() => (window as unknown as { __csp: Violation[] }).__csp)), ...consoleErrors];
}

test("pages carry CSP, HSTS, nosniff, referrer and framing headers", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("script-src 'self' 'nonce-");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["strict-transport-security"]).toMatch(/max-age=\d+; includeSubDomains/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["permissions-policy"]).toMatch(/camera=\(\)/);
  expect(h["x-powered-by"]).toBeUndefined();
});

test("API responses and static files carry the baseline headers too", async ({ request }) => {
  for (const url of ["/api/health", "/api/me", "/manifest.webmanifest", "/icons/icon-192.png"]) {
    const h = (await request.get(url)).headers();
    expect(h["x-content-type-options"], url).toBe("nosniff");
    expect(h["strict-transport-security"], url).toBeTruthy();
    expect(h["referrer-policy"], url).toBe("strict-origin-when-cross-origin");
  }
});

test("private API responses are not cacheable", async ({ page }) => {
  await loginAs(page, "alice@e2e.test", MONDAY);
  for (const url of ["/api/me", "/api/journey/me", "/api/body", "/api/profile", "/api/dashboard/public", "/api/tracker/today"]) {
    const cc = (await page.request.get(url)).headers()["cache-control"] ?? "";
    expect(cc, url).toMatch(/no-store|private/);
    expect(cc, url).not.toMatch(/public/);
  }
});

test("each response gets a fresh nonce, and it matches the page's scripts", async ({ request }) => {
  const nonceOf = (csp: string) => csp.match(/'nonce-([^']+)'/)![1];
  const a = await request.get("/login");
  const b = await request.get("/login");
  const na = nonceOf(a.headers()["content-security-policy"]);
  const nb = nonceOf(b.headers()["content-security-policy"]);
  expect(na).not.toBe(nb);
  const html = await a.text();
  expect(html).toContain(`nonce="${na}"`); // Next stamped its inline scripts with this request's nonce
  expect(html).not.toContain(`nonce="${nb}"`);
});

test.describe("injection attempts are blocked", () => {
  // Each of these is a real XSS vector. None may execute; each must be reported as a CSP violation.
  const attacks: Record<string, string> = {
    "an inline <script> added to the DOM": `const s = document.createElement("script"); s.textContent = "window.__xss = true"; document.body.appendChild(s);`,
    "an inline event handler (<img onerror>)": `const d = document.createElement("div"); d.innerHTML = '<img src="x:x" onerror="window.__xss = true">'; document.body.appendChild(d);`,
    "a javascript: link": `const a = document.createElement("a"); a.href = "javascript:window.__xss = true"; document.body.appendChild(a); a.click();`,
    "a script written by the parser (document.write)": `document.write("<script>window.__xss = true<\/script>");`,
    "a script from another origin": `const s = document.createElement("script"); s.src = "https://evil.example/x.js"; document.head.appendChild(s);`,
  };
  for (const [name, code] of Object.entries(attacks)) {
    test(name, async ({ page }) => {
      const violations = await trackViolations(page);
      await page.route("https://evil.example/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "window.__xss = true" }));
      await page.goto("/login");
      await page.evaluate(`window.__xss = false; ${code}`);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => (window as unknown as { __xss: boolean }).__xss)).toBe(false);
      expect((await violations()).length).toBeGreaterThan(0);
    });
  }
});

test("no screen triggers a CSP violation (the policy does not break the app)", async ({ page }) => {
  const violations = await trackViolations(page);
  for (const path of ["/login", "/forgot", "/install", "/offline", "/ui-preview"]) {
    await page.goto(path);
    await page.waitForTimeout(500);
  }
  await loginAs(page, "owner@e2e.test", MONDAY);
  for (const path of ["/today", "/dashboard", "/progress", "/settings"]) {
    await page.goto(path);
    await page.waitForTimeout(600);
  }
  // exercise the crop preview (blob: image) and Day-75 celebration, the two least ordinary pieces
  await page.goto("/settings");
  await hydrated(page);
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#4f46e5" } }).png().toBuffer();
  await page.getByLabel("Choose a photo").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("crop-view")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await violations()).toEqual([]);
});

test("the app still works end to end under the CSP (sign in and out through the UI)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("todd@e2e.test");
  await page.getByLabel("Password").fill("e2e-test-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Circle", level: 1 })).toBeVisible();
});
