import { expect, test } from "@playwright/test";

test("AT-05: unauthenticated request to a data route is 401", async ({ request }) => {
  const res = await request.get("/api/me");
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("health check is public and answers up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("AT-05: tracker routes need a session", async ({ request }) => {
  expect((await request.get("/api/tracker/today")).status()).toBe(401);
  const put = await request.put("/api/tracker/2026-11-20", { data: { runKm: 5 } });
  expect(put.status()).toBe(401);
});
