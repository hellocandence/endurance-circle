import { expect, test } from "@playwright/test";

test("/api/auth/session is empty when logged out", async ({ request }) => {
  const res = await request.get("/api/auth/session");
  expect(res.status()).toBe(200);
  // Auth.js v5 returns null (v4 returned {}); either means "no session".
  const body = await res.json();
  expect(body === null || Object.keys(body).length === 0).toBe(true);
});
