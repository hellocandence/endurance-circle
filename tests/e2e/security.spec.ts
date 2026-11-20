import { expect, test, type Browser } from "@playwright/test";
import { E2E_PASSWORD } from "./setup/constants";
import { hydrated, loginAs, MONDAY } from "./helpers";

const NEW = "a-brand-new-password-9";
const device = async (browser: Browser, email: string) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAs(page, email, MONDAY);
  return { ctx, page };
};
const status = async (d: { page: import("@playwright/test").Page }) => (await d.page.request.get("/api/me")).status();

test("AT-05: security routes need a session", async ({ request }) => {
  expect((await request.post("/api/account/change-password", { data: { currentPassword: "x", newPassword: "y" } })).status()).toBe(401);
  expect((await request.post("/api/account/sign-out-all", { data: {} })).status()).toBe(401);
});

test.describe("password and sessions (Erin)", () => {
  test.describe.configure({ mode: "serial" });

  test("a wrong current password is refused and the guesses are limited", async ({ browser }) => {
    const me = await device(browser, "erin@e2e.test");
    const wrong = { currentPassword: "definitely-not-it", newPassword: NEW };
    for (let i = 0; i < 5; i++) expect((await me.page.request.post("/api/account/change-password", { data: wrong })).status()).toBe(403);
    expect((await me.page.request.post("/api/account/change-password", { data: wrong })).status()).toBe(429);
    await me.ctx.close();
  });
});

test("changing the password ends other devices but not this one; sign-out-all ends everything", async ({ browser }) => {
  // frank only: this test ends sessions and changes the password, so nobody else may share the account
  const a = await device(browser, "frank@e2e.test");
  const b = await device(browser, "frank@e2e.test");
  expect(await status(a)).toBe(200);
  expect(await status(b)).toBe(200);

  const change = await a.page.request.post("/api/account/change-password", { data: { currentPassword: E2E_PASSWORD, newPassword: NEW } });
  expect(change.status()).toBe(200);
  expect(await change.json()).toMatchObject({ ok: true, signedOutOthers: 1 });
  expect(await status(a)).toBe(200); // this device stays signed in
  expect(await status(b)).toBe(401); // the other device is out

  const old = await a.page.request.post("/api/login", { data: { email: "frank@e2e.test", password: E2E_PASSWORD }, headers: { "cf-connecting-ip": "10.77.1.1" } });
  expect(old.status()).toBe(401);
  const fresh = await b.page.request.post("/api/login", { data: { email: "frank@e2e.test", password: NEW }, headers: { "cf-connecting-ip": "10.77.1.2" } });
  expect(fresh.status()).toBe(200);
  expect(await status(b)).toBe(200);

  const out = await a.page.request.post("/api/account/sign-out-all", { data: {} });
  expect(out.status()).toBe(200);
  expect(await status(a)).toBe(401); // old sessions are invalid after sign-out-all
  expect(await status(b)).toBe(401);

  // restore the password for other specs
  const again = await device(browser, "frank@e2e.test").catch(() => null);
  expect(again).toBeNull(); // the old password no longer works
  const relog = await a.page.request.post("/api/login", { data: { email: "frank@e2e.test", password: NEW }, headers: { "cf-connecting-ip": "10.77.1.3" } });
  expect(relog.status()).toBe(200);
  expect((await a.page.request.post("/api/account/change-password", { data: { currentPassword: NEW, newPassword: E2E_PASSWORD } })).status()).toBe(200);
  await a.ctx.close();
  await b.ctx.close();
});

test("weak and unchanged new passwords are rejected", async ({ page }) => {
  await loginAs(page, "todd@e2e.test", MONDAY);
  expect((await page.request.post("/api/account/change-password", { data: { currentPassword: E2E_PASSWORD, newPassword: "short" } })).status()).toBe(400);
  expect((await page.request.post("/api/account/change-password", { data: { currentPassword: E2E_PASSWORD, newPassword: E2E_PASSWORD } })).status()).toBe(400);
});

test("Settings: change password and sign out of all devices", async ({ page }) => {
  await loginAs(page, "erin@e2e.test", MONDAY);
  await page.goto("/settings");
  expect(page.viewportSize()!.width).toBe(375);
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();

  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(NEW);
  await page.getByLabel("Confirm new password").fill("something-different");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("don't match");

  await page.getByRole("button", { name: "Sign out of all devices" }).click();
  await expect(page.getByText("Sign out of every device, including this one?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Sign out of all devices" }).click();
  await page.getByRole("button", { name: "Yes, sign out everywhere" }).click();
  await page.waitForURL("**/login");
  expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("Log out at the bottom of Settings ends this device only", async ({ browser }) => {
  const base = test.info().project.use.baseURL;
  const open = async () => {
    const ctx = await browser.newContext({ baseURL: base });
    const page = await ctx.newPage();
    await loginAs(page, "bob@e2e.test", MONDAY);
    return { ctx, page };
  };
  const phone = await open();
  const laptop = await open();
  await phone.page.goto("/settings");
  await hydrated(phone.page);
  const logout = phone.page.getByRole("button", { name: "Log out" });
  await expect(logout).toBeVisible();
  // it is the last thing on the page
  expect(await phone.page.locator("main button, main a").last().innerText()).toBe("Log out");
  await logout.click();
  await phone.page.waitForURL("**/login");
  expect((await phone.page.request.get("/api/me")).status()).toBe(401);
  expect((await laptop.page.request.get("/api/me")).status()).toBe(200); // the other device is untouched
  await phone.ctx.close();
  await laptop.ctx.close();
});

test("the session cookie is re-issued with a fresh 90-day expiry on every visit (installed apps stay signed in)", async ({ page }) => {
  await loginAs(page, "bob@e2e.test", MONDAY);
  await page.goto("/dashboard");
  const cookie = (await page.context().cookies()).find((c) => c.name.endsWith("authjs.session-token"))!;
  const days = (cookie.expires - Date.now() / 1000) / 86400;
  expect(days).toBeGreaterThan(89);
  expect(days).toBeLessThanOrEqual(90.1);
});
