import { expect, test } from "@playwright/test";

test.describe("account routes (public, generic responses)", () => {
  test("forgot-password answers the same for unknown emails", async ({ request }) => {
    const res = await request.post("/api/account/forgot-password", { data: { email: "nobody@example.com" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("bad tokens are rejected", async ({ request }) => {
    expect((await request.post("/api/account/verify-email", { data: { token: "nope" } })).status()).toBe(400);
    const r = await request.post("/api/account/reset-password", { data: { token: "nope", password: "long-enough-password" } });
    expect(r.status()).toBe(400);
  });

  test("malformed input is rejected", async ({ request }) => {
    expect((await request.post("/api/account/forgot-password", { data: { email: "not-an-email" } })).status()).toBe(400);
    expect((await request.post("/api/login", { data: {} })).status()).toBe(400);
  });
});

test("cross-site and non-JSON posts are refused (login CSRF)", async ({ request }) => {
  const evil = await request.post("/api/login", {
    data: { email: "a@example.com", password: "x" },
    headers: { origin: "https://evil.example" },
  });
  expect(evil.status()).toBe(403);
  const plain = await request.post("/api/login", { headers: { "content-type": "text/plain" }, data: '{"email":"a@example.com","password":"x"}' });
  expect(plain.status()).toBe(415);
});

test("sign-up and invite-start refuse bad invites", async ({ request }) => {
  const body = { token: "bogus", email: "x@example.com", password: "long-enough-password", name: "X" };
  expect((await request.post("/api/signup", { data: body })).status()).toBe(400);
  expect((await request.post("/api/invite/start", { data: { token: "bogus" } })).status()).toBe(400);
  expect((await request.post("/api/signup", { data: { ...body, email: "nope" } })).status()).toBe(400);
});

test("the OAuth callback always expires the parked invite cookie", async ({ request }) => {
  const res = await request.get("/api/auth/callback/google", { headers: { cookie: "cadence_invite=abc" }, maxRedirects: 0 });
  const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value).join("\n");
  expect(setCookie).toMatch(/cadence_invite=;/);
  expect(setCookie.toLowerCase()).toMatch(/max-age=0/);
});

test("sign-up answers the same for bad invites regardless of email", async ({ request }) => {
  const headers = { "cf-connecting-ip": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const a = await request.post("/api/signup", { headers, data: { token: "bogus", email: "a@example.com", password: "long-enough-password", name: "A" } });
  const b = await request.post("/api/signup", { headers, data: { token: "bogus", email: "b@example.com", password: "long-enough-password", name: "B" } });
  expect([a.status(), await a.json()]).toEqual([b.status(), await b.json()]);
});
