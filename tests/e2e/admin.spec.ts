import { expect, test, type Browser } from "@playwright/test";
import { loginAs, MONDAY } from "./helpers";

// These tests share the owner's invite list, so they run one after another.
test.describe.configure({ mode: "serial" });

const ZERO = "00000000-0000-4000-8000-000000000000";
const open = async (browser: Browser, email: string) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAs(page, email, MONDAY);
  return { ctx, page };
};
const rand = () => Math.random().toString(36).slice(2, 8);
const ip = () => ({ "cf-connecting-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

test("AT-05: admin routes need a session", async ({ request }) => {
  for (const [method, url] of [["get", "/api/admin/invites"], ["post", "/api/admin/invites"], ["get", "/api/admin/members"], ["delete", `/api/admin/members/${ZERO}`], ["delete", `/api/admin/invites/${ZERO}`]] as const) {
    expect((await request[method](url)).status(), `${method} ${url}`).toBe(401);
  }
});

test("AT-08: a member cannot invite, revoke, list or remove", async ({ browser }) => {
  const owner = await open(browser, "owner@e2e.test");
  const invite = await (await owner.page.request.post("/api/admin/invites")).json();
  const members = (await (await owner.page.request.get("/api/admin/members")).json()).members as { id: string; email: string }[];
  const aliceId = members.find((m) => m.email === "alice@e2e.test")!.id;

  const bob = await open(browser, "bob@e2e.test");
  expect((await bob.page.request.post("/api/admin/invites")).status()).toBe(403);
  expect((await bob.page.request.get("/api/admin/invites")).status()).toBe(403);
  expect((await bob.page.request.delete(`/api/admin/invites/${invite.id}`)).status()).toBe(403);
  expect((await bob.page.request.get("/api/admin/members")).status()).toBe(403);
  expect((await bob.page.request.delete(`/api/admin/members/${aliceId}`)).status()).toBe(403);
  expect((await bob.page.request.delete(`/api/admin/members/${aliceId}?permanent=true`)).status()).toBe(403);
  expect((await bob.page.request.delete(`/api/admin/members/${ZERO}`)).status()).toBe(403); // cannot probe which ids exist

  // nothing happened: the invite is still pending and Alice is still a member
  const list = (await (await owner.page.request.get("/api/admin/invites")).json()).invites as { id: string; status: string }[];
  expect(list.find((i) => i.id === invite.id)!.status).toBe("pending");
  expect((await owner.page.request.get("/api/admin/members").then((r) => r.json())).members.some((m: { id: string; disabled: boolean }) => m.id === aliceId && !m.disabled)).toBe(true);
  await owner.page.request.delete(`/api/admin/invites/${invite.id}`);
  await owner.ctx.close();
  await bob.ctx.close();
});

test("the owner creates an invite; it works once, can be revoked, and shows in the list", async ({ browser, request }) => {
  const owner = await open(browser, "owner@e2e.test");
  const created = await owner.page.request.post("/api/admin/invites");
  expect(created.status()).toBe(201);
  const { id, url, expiresAt } = await created.json();
  expect(url).toMatch(/\/invite\/[\w-]{20,}$/);
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.1);
  const token = url.split("/invite/")[1];

  // the raw token is not retrievable later
  const listText = await (await owner.page.request.get("/api/admin/invites")).text();
  expect(listText).not.toContain(token);

  // the invite page accepts it, and a new member signs up with it
  const email = `new-${rand()}@e2e.test`;
  const signup = await request.post("/api/signup", { data: { token, email, password: "long-enough-password", name: "New Person" }, headers: ip() });
  expect(signup.status()).toBe(201);
  const reuse = await request.post("/api/signup", { data: { token, email: `again-${rand()}@e2e.test`, password: "long-enough-password", name: "Again" }, headers: ip() });
  expect(reuse.status()).toBe(400); // AT-06 over HTTP
  const afterUse = (await (await owner.page.request.get("/api/admin/invites")).json()).invites as { id: string; status: string }[];
  expect(afterUse.find((i) => i.id === id)!.status).toBe("used");
  expect((await owner.page.request.delete(`/api/admin/invites/${id}`)).status()).toBe(409); // cannot revoke a used invite

  // a second invite, revoked before use
  const second = await (await owner.page.request.post("/api/admin/invites")).json();
  expect((await owner.page.request.delete(`/api/admin/invites/${second.id}`)).status()).toBe(200);
  const blocked = await request.post("/api/signup", { data: { token: second.url.split("/invite/")[1], email: `x-${rand()}@e2e.test`, password: "long-enough-password", name: "X" }, headers: ip() });
  expect(blocked.status()).toBe(400);
  expect((await owner.page.request.delete(`/api/admin/invites/${ZERO}`)).status()).toBe(409);
  expect((await owner.page.request.delete("/api/admin/invites/not-a-uuid")).status()).toBe(404);
  await owner.ctx.close();
});

test("the owner removes a member (disable) or deletes them; never themself", async ({ browser, request }) => {
  const owner = await open(browser, "owner@e2e.test");
  const ownerId = (await (await owner.page.request.get("/api/me")).json()).id;
  const mk = async () => {
    const inv = await (await owner.page.request.post("/api/admin/invites")).json();
    const email = `rm-${rand()}@e2e.test`;
    await request.post("/api/signup", { data: { token: inv.url.split("/invite/")[1], email, password: "long-enough-password", name: "Temp" }, headers: ip() });
    const all = (await (await owner.page.request.get("/api/admin/members")).json()).members as { id: string; email: string }[];
    return all.find((m) => m.email === email)!.id;
  };

  const soft = await mk();
  const r1 = await owner.page.request.delete(`/api/admin/members/${soft}`);
  expect(r1.status()).toBe(200);
  expect(await r1.json()).toMatchObject({ mode: "disabled" });
  let list = (await (await owner.page.request.get("/api/admin/members")).json()).members as { id: string; disabled: boolean }[];
  expect(list.find((m) => m.id === soft)!.disabled).toBe(true);

  const hard = await mk();
  expect(await (await owner.page.request.delete(`/api/admin/members/${hard}?permanent=true`)).json()).toMatchObject({ mode: "deleted" });
  list = (await (await owner.page.request.get("/api/admin/members")).json()).members;
  expect(list.some((m) => m.id === hard)).toBe(false);

  expect((await owner.page.request.delete(`/api/admin/members/${ownerId}`)).status()).toBe(403); // not even the owner themself
  expect((await owner.page.request.delete(`/api/admin/members/${ZERO}`)).status()).toBe(404);
  expect((await owner.page.request.delete("/api/admin/members/not-a-uuid")).status()).toBe(404);
  await owner.ctx.close();
});

test("Settings: only the owner sees Circle admin, and can create an invite link", async ({ browser }) => {
  const member = await open(browser, "bob@e2e.test");
  await member.page.goto("/settings");
  await expect(member.page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(member.page.getByRole("heading", { name: "Circle admin" })).toHaveCount(0);
  await member.ctx.close();

  const owner = await open(browser, "owner@e2e.test");
  await owner.page.goto("/settings");
  expect(owner.page.viewportSize()!.width).toBe(375);
  await expect(owner.page.getByRole("heading", { name: "Circle admin" })).toBeVisible();
  await owner.page.getByRole("button", { name: "Create invite link" }).click();
  const field = owner.page.getByLabel("Invite link", { exact: true });
  await expect(field).toHaveValue(/\/invite\/[\w-]+$/);
  await expect(owner.page.getByRole("list", { name: "Invites" })).toContainText("pending");
  await owner.page.getByRole("button", { name: /^Revoke invite/ }).first().click();
  await expect(owner.page.getByText("Invite revoked.")).toBeVisible();
  expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await owner.ctx.close();
});
