// T081: the twelve privacy-critical acceptance tests from docs/02-PRD.md §9, AT-01 to AT-12, one test each,
// run over real HTTP against the seeded server. `pnpm test:privacy` runs just this file.
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import sharp from "sharp";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./setup/constants";
import { loginAs, MONDAY, SUNDAY } from "./helpers";

const ZERO = "00000000-0000-4000-8000-000000000000";
const idOf = async (page: Page) => (await (await page.request.get("/api/me")).json()).id as string;
const rand = () => Math.random().toString(36).slice(2, 8);
const fakeIp = () => ({ "cf-connecting-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

async function as(browser: Browser, email: string, now = MONDAY) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAs(page, email, now);
  return { ctx, page };
}

test("AT-01: Member A requests Member B's body metrics via API → 403", async ({ browser }) => {
  const b = await as(browser, "dave@e2e.test");
  const dave = await idOf(b.page);
  const a = await as(browser, "bob@e2e.test");
  const res = await a.page.request.get(`/api/members/${dave}/body`);
  expect(res.status()).toBe(403);
  expect(await res.text()).not.toMatch(/weight|75|protein/i); // not even a hint in the error body
  expect((await a.page.request.patch(`/api/members/${dave}/body`, { data: { weightKg: 50 } })).status()).toBe(403);
  await a.ctx.close();
  await b.ctx.close();
});

test("AT-02: Member A requests Member B's private journey → 403", async ({ browser }) => {
  const b = await as(browser, "carol@e2e.test");
  const carol = await idOf(b.page);
  await b.page.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "AT02-SECRET" } });
  const a = await as(browser, "bob@e2e.test");
  const res = await a.page.request.get(`/api/members/${carol}/journey`);
  expect(res.status()).toBe(403);
  expect(await res.text()).not.toContain("AT02-SECRET");
  await a.ctx.close();
  await b.ctx.close();
});

test("AT-03: Member requests the public feed → only public fields; no weight, limits or private notes", async ({ browser }) => {
  const owner = await as(browser, "alice@e2e.test");
  await owner.page.request.patch("/api/body", { data: { weightKg: 68.25, heightCm: 171.5, runTargetKm: 6.5 } });
  await owner.page.request.put("/api/tracker/2026-11-23", { data: { privateNotes: "AT03-PRIVATE-NOTE", updateText: "a public line" } });
  const reader = await as(browser, "bob@e2e.test");
  const feed = await reader.page.request.get("/api/dashboard/public");
  expect(feed.status()).toBe(200);
  const text = await feed.text();
  for (const secret of ["AT03-PRIVATE-NOTE", "68.25", "171.5", "6.5"]) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/weight|height|protein|waterTarget|runTarget|studyMin|limits|privateNotes|email|passwordHash/i);
  for (const m of (JSON.parse(text).members as Record<string, unknown>[])) {
    expect(Object.keys(m).sort()).toEqual(["avatarUrl", "commitmentPct", "dayNumber", "displayName", "id", "isMe", "streak", "todayDone", "todayTotal", "updateText"]);
  }
  // the progress list is public too, and just as clean
  expect(await (await reader.page.request.get("/api/progress")).text()).not.toMatch(/weight|privateNotes|AT03/i);
  await owner.ctx.close();
  await reader.ctx.close();
});

test("AT-04: the owner requests any member's body metrics → 200", async ({ browser }) => {
  const m = await as(browser, "dave@e2e.test");
  const dave = await idOf(m.page);
  const owner = await as(browser, "owner@e2e.test");
  const res = await owner.page.request.get(`/api/members/${dave}/body`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ userId: dave, weightKg: expect.any(Number), proteinTargetG: expect.any(Number) });
  await owner.ctx.close();
  await m.ctx.close();
});

test.describe("AT-05: unauthenticated requests to any data route → 401", () => {
  // The routes are discovered from the source tree, so a route added later cannot escape this test.
  const PUBLIC = new Set([
    "api/auth/[...nextauth]/route.ts", "api/health/route.ts", "api/login/route.ts", "api/signup/route.ts", "api/invite/start/route.ts",
    "api/account/forgot-password/route.ts", "api/account/reset-password/route.ts", "api/account/resend-verification/route.ts", "api/account/verify-email/route.ts",
  ]);
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : n === "route.ts" ? [join(dir, n)] : []));
  const routes = walk("src/app/api").map((f) => ({ rel: relative("src/app", f), src: readFileSync(f, "utf8") })).filter((r) => !PUBLIC.has(r.rel));

  test("there are data routes to check", () => expect(routes.length).toBeGreaterThan(15));

  test("every method of every data route answers 401 with no session", async ({ request }) => {
    const failures: string[] = [];
    let checked = 0;
    for (const r of routes) {
      const url = "/" + r.rel.replace(/\/route\.ts$/, "").replace(/\[userId\]|\[id\]/g, ZERO).replace("[date]", "2026-11-23");
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
        if (!new RegExp(`export const ${method}\\b|export async function ${method}\\b`).test(r.src)) continue;
        const res = await request.fetch(url, { method, data: method === "GET" || method === "DELETE" ? undefined : {}, maxRedirects: 0 });
        checked++;
        if (res.status() !== 401) failures.push(`${method} ${url} → ${res.status()}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(routes.length); // at least one method checked per route file
    expect(failures).toEqual([]);
  });
});

test("AT-06: an invite token used twice → the second use is rejected", async ({ browser, request }) => {
  const owner = await as(browser, "owner@e2e.test");
  const { url } = await (await owner.page.request.post("/api/admin/invites")).json();
  const token = url.split("/invite/")[1];
  const body = (email: string) => ({ token, email, password: "long-enough-password", name: "AT06" });
  expect((await request.post("/api/signup", { data: body(`at06-${rand()}@e2e.test`), headers: fakeIp() })).status()).toBe(201);
  const second = await request.post("/api/signup", { data: body(`at06b-${rand()}@e2e.test`), headers: fakeIp() });
  expect(second.status()).toBe(400);
  expect((await second.json()).error).toBe("invalid_invite");
  await owner.ctx.close();
});

test("AT-07: an expired invite token → rejected", async ({ browser, request }) => {
  const owner = await as(browser, "owner@e2e.test");
  const { url, expiresAt } = await (await owner.page.request.post("/api/admin/invites")).json();
  const token = url.split("/invite/")[1];
  const eightDaysOn = new Date(Date.now() + 8 * 86_400_000).toISOString();
  expect(new Date(expiresAt).getTime()).toBeLessThan(new Date(eightDaysOn).getTime());
  const late = await request.post("/api/signup", { data: { token, email: `at07-${rand()}@e2e.test`, password: "long-enough-password", name: "AT07" }, headers: { ...fakeIp(), "x-cadence-test-now": eightDaysOn } });
  expect(late.status()).toBe(400);
  expect((await late.json()).error).toBe("invalid_invite");
  // the same invite still works inside its 7 days: it was the expiry that rejected it
  const inTime = await request.post("/api/signup", { data: { token, email: `at07b-${rand()}@e2e.test`, password: "long-enough-password", name: "AT07" }, headers: fakeIp() });
  expect(inTime.status()).toBe(201);
  await owner.ctx.close();
});

test("AT-08: a member tries to invite or remove members → 403", async ({ browser }) => {
  const member = await as(browser, "bob@e2e.test");
  const owner = await as(browser, "owner@e2e.test");
  const aliceId = ((await (await owner.page.request.get("/api/admin/members")).json()).members as { id: string; email: string }[]).find((m) => m.email === "alice@e2e.test")!.id;
  expect((await member.page.request.post("/api/admin/invites")).status()).toBe(403);
  expect((await member.page.request.delete(`/api/admin/members/${aliceId}`)).status()).toBe(403);
  expect((await member.page.request.delete(`/api/admin/members/${aliceId}?permanent=true`)).status()).toBe(403);
  expect((await member.page.request.get("/api/admin/members")).status()).toBe(403);
  const stillThere = ((await (await owner.page.request.get("/api/admin/members")).json()).members as { id: string; disabled: boolean }[]).find((m) => m.id === aliceId)!;
  expect(stillThere.disabled).toBe(false);
  await member.ctx.close();
  await owner.ctx.close();
});

test("AT-09: Sunday, the run is not required and stretch is → the day completes with stretch only", async ({ browser }) => {
  const m = await as(browser, "carol@e2e.test", SUNDAY);
  const day = { warmupPreDone: false, warmupPostDone: false, runKm: 0, waterL: 3, electrolytesDone: true, proteinG: 100, studyMin: 60, techNote: "tip", githubContribution: true, readingMin: 10 };

  const noStretch = await (await m.page.request.put("/api/tracker/2026-11-22", { data: day })).json();
  expect(noStretch.isSunday).toBe(true);
  expect(noStretch.evaluation.required).toContain("STRETCH");
  expect(noStretch.evaluation.required).not.toContain("RUN");
  expect(noStretch.evaluation.completed).toBe(false); // stretch missing: the only thing outstanding
  expect(noStretch.evaluation.pending).toEqual(["STRETCH"]);

  const done = await (await m.page.request.put("/api/tracker/2026-11-22", { data: { stretchMin: 25 } })).json();
  expect(done.evaluation).toMatchObject({ completed: true, pending: [], requiredCount: 8 });
  expect(done.log).toMatchObject({ runKm: 0, completed: true, isSunday: true });
  await m.ctx.close();
});

test("AT-10: a missed task is logged and the day count continues", async ({ browser }) => {
  const m = await as(browser, "dave@e2e.test", SUNDAY); // "now" is Sunday 2026-11-22, day 22; Saturday 11-21 is yesterday
  const sat = await (await m.page.request.put("/api/tracker/2026-11-21", { data: { runKm: 5, warmupPreDone: true, warmupPostDone: true, waterL: 3 } })).json();
  expect(sat.dayNumber).toBe(21);
  expect(sat.evaluation.completed).toBe(false);
  expect(sat.evaluation.missed).toEqual(expect.arrayContaining(["ELECTRO", "PROTEIN", "STUDY", "TECH", "GITHUB", "SATSANG"])); // logged as missed
  expect(sat.log.missedTasks).toEqual(sat.evaluation.missed); // and stored

  const today = await (await m.page.request.get("/api/tracker/today")).json();
  expect(today.dayNumber).toBe(22); // the count carried on, nothing reset
  expect(today.date).toBe("2026-11-22");

  const journey = await (await m.page.request.get("/api/journey/me")).json();
  expect(journey.programme.dayNumber).toBe(22);
  expect(journey.logs.find((l: { logDate: string }) => l.logDate === "2026-11-21").completed).toBe(false);
  await m.ctx.close();
});

test("AT-11: uploading a 5 MB+ non-image → rejected", async ({ browser }) => {
  const m = await as(browser, "fresh@e2e.test");
  const big = await m.page.request.post("/api/photo", { multipart: { file: { name: "photo.jpg", mimeType: "image/jpeg", buffer: randomBytes(5 * 1024 * 1024 + 1024) } } });
  expect(big.status()).toBe(413);
  const fake = await m.page.request.post("/api/photo", { multipart: { file: { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("MZ not an image") } } });
  expect(fake.status()).toBe(415);
  expect((await m.page.request.get(`/api/photos/${await idOf(m.page)}?size=128`)).status()).toBe(404); // nothing was stored
  await m.ctx.close();
});

test("AT-12: the stored photo is WebP, at most 300 KB, at 512 px", async ({ browser }) => {
  const m = await as(browser, "erin@e2e.test");
  const noisy = await sharp(randomBytes(1600 * 1200 * 3), { raw: { width: 1600, height: 1200, channels: 3 } }).jpeg({ quality: 90 }).withExif({ IFD0: { Copyright: "AT12-EXIF-SECRET" } }).toBuffer();
  expect(noisy.length).toBeGreaterThan(500_000); // a heavy, awkwardly shaped upload
  expect((await m.page.request.post("/api/photo", { multipart: { file: { name: "big.jpg", mimeType: "image/jpeg", buffer: noisy } } })).status()).toBe(201);

  const stored = await m.page.request.get(`/api/photos/${await idOf(m.page)}?size=512`);
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/webp");
  const bytes = await stored.body();
  expect(bytes.length).toBeLessThanOrEqual(300 * 1024);
  expect(await sharp(bytes).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 });
  expect(bytes.includes(Buffer.from("AT12-EXIF-SECRET"))).toBe(false); // EXIF is gone
  expect((await sharp(bytes).metadata()).exif).toBeUndefined();
  await m.ctx.close();
});

// A smoke check that the seeded accounts use the documented password, so a failing AT is never just a login problem.
test("setup: the seeded accounts can sign in", async ({ request }) => {
  const res = await request.post("/api/login", { data: { email: "owner@e2e.test", password: E2E_PASSWORD }, headers: fakeIp() });
  expect(res.status()).toBe(200);
});
