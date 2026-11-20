import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

const mock = (page: Page, url: string, status: number, json: object) =>
  page.route(`**${url}`, (route) => route.fulfill({ status, json }));

test.describe("login", () => {
  test("is usable by keyboard at 375px and signs in", async ({ page }) => {
    await mock(page, "/api/login", 200, { ok: true });
    await page.goto("/login");
    expect(page.viewportSize()!.width).toBe(375);
    await noHorizontalScroll(page);

    await page.getByLabel("Email").focus();
    await page.keyboard.type("me@example.com");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
    await page.keyboard.type("a-long-enough-pw");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show" })).toBeFocused();
    await page.keyboard.press("Enter"); // toggles visibility, does not submit
    await expect(page.getByLabel("Password")).toHaveAttribute("type", "text");
    await page.getByLabel("Password").focus();
    await page.keyboard.press("Enter"); // submits the form
    await page.waitForURL("**/dashboard");
  });

  test("ignores an unsafe ?next= target", async ({ page }) => {
    await mock(page, "/api/login", 200, { ok: true });
    await page.goto("/login?next=//evil.example");
    await page.getByLabel("Email").fill("me@example.com");
    await page.getByLabel("Password").fill("a-long-enough-pw");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    expect(new URL(page.url()).hostname).toBe("localhost");
  });

  test("shows clear errors", async ({ page }) => {
    await page.goto("/login");
    const submit = async () => {
      await page.getByLabel("Email").fill("me@example.com");
      await page.getByLabel("Password").fill("whatever-password");
      await page.getByRole("button", { name: "Sign in" }).click();
    };
    await mock(page, "/api/login", 401, { error: "invalid_credentials" });
    await submit();
    await expect(page.locator("p[role=alert]")).toHaveText("Incorrect email or password.");

    await page.unroute("**/api/login");
    await mock(page, "/api/login", 429, { error: "rate_limited" });
    await submit();
    await expect(page.locator("p[role=alert]")).toContainText("Too many attempts");

    await page.unroute("**/api/login");
    await mock(page, "/api/login", 403, { error: "email_not_verified" });
    await mock(page, "/api/account/resend-verification", 200, { ok: true });
    await submit();
    await expect(page.locator("p[role=alert]")).toContainText("verify your email");
    await page.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByRole("button", { name: "Verification email sent" })).toBeDisabled();
  });

  test("explains a denied Google sign-in", async ({ page }) => {
    await page.goto("/login?error=AccessDenied");
    await expect(page.locator("p[role=alert]")).toContainText("isn't part of this circle");
  });
});

test("forgot password gives a generic confirmation", async ({ page }) => {
  await mock(page, "/api/account/forgot-password", 200, { ok: true });
  await page.goto("/forgot");
  await noHorizontalScroll(page);
  await page.getByLabel("Email").fill("anyone@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If that email has a Cadence account");
});

test.describe("reset password", () => {
  test("checks the two passwords match, then sets it", async ({ page }) => {
    await page.goto("/reset?token=abc123");
    await noHorizontalScroll(page);
    await page.getByLabel("New password", { exact: true }).fill("brand-new-password");
    await page.getByLabel("Confirm new password").fill("different-password");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("don't match");

    let sent: { token?: string; password?: string } = {};
    await page.route("**/api/account/reset-password", (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.getByLabel("Confirm new password").fill("brand-new-password");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("status")).toContainText("Password updated");
    expect(sent).toEqual({ token: "abc123", password: "brand-new-password" });
  });

  test("a link without a token cannot be submitted", async ({ page }) => {
    await page.goto("/reset");
    await expect(page.locator("p[role=alert]")).toContainText("missing its token");
    await expect(page.getByRole("button", { name: "Set new password" })).toBeDisabled();
  });

  test("an expired link points to a new request", async ({ page }) => {
    await mock(page, "/api/account/reset-password", 400, { error: "invalid_token" });
    await page.goto("/reset?token=old");
    await page.getByLabel("New password", { exact: true }).fill("brand-new-password");
    await page.getByLabel("Confirm new password").fill("brand-new-password");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("invalid or has expired");
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });
});

test.describe("verify email", () => {
  test("verifies exactly once on load", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/account/verify-email", (route) => {
      calls++;
      return route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto("/verify?token=tok");
    await expect(page.getByRole("status")).toContainText("Email verified");
    expect(calls).toBe(1);
  });

  test("shows an error for a bad link", async ({ page }) => {
    await mock(page, "/api/account/verify-email", 400, { error: "invalid_token" });
    await page.goto("/verify?token=bad");
    await expect(page.locator("p[role=alert]")).toContainText("invalid or has expired");
  });
});

test.describe("invites", () => {
  test("an unknown invite shows a clear message", async ({ page }) => {
    await page.goto("/invite/not-a-real-token");
    await expect(page.getByRole("heading", { name: "Invite not valid" })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("/signup explains that Cadence is invite-only", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Cadence is invite-only" })).toBeVisible();
  });
});

test.describe("accessibility (axe, serious and critical)", () => {
  for (const path of ["/login", "/forgot", "/reset?token=x", "/verify?token=x", "/signup", "/invite/nope"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(800);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
  }
});
