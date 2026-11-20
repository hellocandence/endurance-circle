import { expect, test } from "@playwright/test";

// Each test uses its own client address (cf-connecting-ip) and email so counters never collide.
const rand = () => Math.random().toString(36).slice(2, 10);
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

test("the 11th login attempt in 15 minutes returns 429", async ({ request }) => {
  const headers = { "cf-connecting-ip": fakeIp() };
  const data = { email: `limit-${rand()}@example.com`, password: "wrong-password-1" };

  for (let i = 1; i <= 10; i++) {
    const res = await request.post("/api/login", { data, headers });
    expect(res.status(), `attempt ${i}`).toBe(401);
  }
  const eleventh = await request.post("/api/login", { data, headers });
  expect(eleventh.status()).toBe(429);
  expect(Number(eleventh.headers()["retry-after"])).toBeGreaterThan(0);

  // a different account from the same address is still allowed (limit is per IP + email)
  const other = await request.post("/api/login", { data: { ...data, email: `other-${rand()}@example.com` }, headers });
  expect(other.status()).toBe(401);
});

test("invite and token endpoints are rate limited per address", async ({ request }) => {
  const headers = { "cf-connecting-ip": fakeIp() };
  let last = 0;
  for (let i = 0; i < 21; i++) last = (await request.post("/api/invite/start", { data: { token: `bogus-${i}` }, headers })).status();
  expect(last).toBe(429);
});

test("password-reset requests are limited per address and email", async ({ request }) => {
  const headers = { "cf-connecting-ip": fakeIp() };
  const data = { email: `victim-${rand()}@example.com` };
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await request.post("/api/account/forgot-password", { data, headers })).status());
  expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
  expect(statuses[5]).toBe(429);
});
