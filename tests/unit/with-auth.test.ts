import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/server/rbac/errors";
import { createWithAuth, type AuthedUser } from "@/server/rbac/with-auth";

const alice: AuthedUser = { id: "alice", role: "MEMBER", name: "Alice", email: "a@example.com" };
const owner: AuthedUser = { id: "owner", role: "OWNER", name: "Owner", email: "o@example.com" };
const as = (u: AuthedUser | null) => createWithAuth(async () => u);
const ok = () => Response.json({ ok: true });
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const req = (method = "GET", headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/x", { method, headers: { host: "localhost:3000", ...headers } });

describe("withAuth", () => {
  const body = { action: "read" as const, resource: ({ params }: { params: Record<string, string> }) => ({ kind: "body" as const, ownerId: params.id }) };

  it("401 when there is no session, and the handler never runs", async () => {
    let ran = false;
    const route = as(null)(body, () => ((ran = true), ok()));
    const res = await route(req(), ctx({ id: "alice" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(ran).toBe(false);
  });

  it("403 when can() says no (AT-01: member reads another member's body metrics)", async () => {
    let ran = false;
    const res = await as(alice)(body, () => ((ran = true), ok()))(req(), ctx({ id: "bob" }));
    expect(res.status).toBe(403);
    expect(ran).toBe(false);
  });

  it("200 for own data, and for the owner reading anyone's (AT-04)", async () => {
    expect((await as(alice)(body, ok)(req(), ctx({ id: "alice" }))).status).toBe(200);
    expect((await as(owner)(body, ok)(req(), ctx({ id: "alice" }))).status).toBe(200);
  });

  it("passes the user and params to the handler", async () => {
    const route = as(alice)(body, (_r, c) => Response.json({ who: c.user.id, id: c.params.id }));
    expect(await (await route(req(), ctx({ id: "alice" }))).json()).toEqual({ who: "alice", id: "alice" });
  });

  it("supports async resource resolvers", async () => {
    const route = as(alice)({ action: "read", resource: async () => ({ kind: "circle.public" }) }, ok);
    expect((await route(req(), ctx())).status).toBe(200);
  });

  it("maps ForbiddenError thrown by projections to 403", async () => {
    const route = as(alice)({ action: "read", resource: () => ({ kind: "circle.public" }) }, () => {
      throw new ForbiddenError();
    });
    expect((await route(req(), ctx())).status).toBe(403);
  });

  it("turns unexpected errors into a bare 500 without leaking the message", async () => {
    const route = as(alice)({ action: "read", resource: () => ({ kind: "circle.public" }) }, () => {
      throw new Error("SELECT * FROM users WHERE password_hash = 'secret'");
    });
    const res = await route(req(), ctx());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });

  it("refuses cross-origin writes but allows same-origin and reads", async () => {
    const write = as(alice)({ action: "write", resource: () => ({ kind: "tracker", ownerId: "alice" }) }, ok);
    expect((await write(req("PUT", { origin: "https://evil.example" }), ctx())).status).toBe(403);
    expect((await write(req("DELETE", { "sec-fetch-site": "cross-site" }), ctx())).status).toBe(403);
    expect((await write(req("PUT", { origin: "http://localhost:3000" }), ctx())).status).toBe(200);
    expect((await write(req("PUT"), ctx())).status).toBe(200);
    const read = as(alice)({ action: "read", resource: () => ({ kind: "circle.public" }) }, ok);
    expect((await read(req("GET", { origin: "https://evil.example" }), ctx())).status).toBe(200);
  });

  it("checks the session before anything else (unauthenticated cross-origin write → 401)", async () => {
    const res = await as(null)({ action: "write", resource: () => ({ kind: "tracker", ownerId: "x" }) }, ok)(req("PUT", { origin: "https://evil.example" }), ctx());
    expect(res.status).toBe(401);
  });
});

// AT-05 safety net: every API route must be guarded, or be on this explicit allowlist of public routes.
const PUBLIC_ROUTES = [
  "api/auth/[...nextauth]/route.ts", // Auth.js itself
  "api/health/route.ts",
  "api/login/route.ts",
  "api/signup/route.ts",
  "api/invite/start/route.ts",
  "api/account/forgot-password/route.ts",
  "api/account/reset-password/route.ts",
  "api/account/resend-verification/route.ts",
  "api/account/verify-email/route.ts",
];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return /^route\.(ts|tsx|js)$/.test(name) ? [p] : [];
  });
}

describe("every /api route is guarded or explicitly public", () => {
  const files = routeFiles("src/app/api").map((f) => ({ rel: relative("src/app", f), src: readFileSync(f, "utf8") }));

  it("finds the routes", () => expect(files.length).toBeGreaterThan(5));

  it("guarded routes use withAuth", () => {
    const unguarded = files.filter((f) => !PUBLIC_ROUTES.includes(f.rel) && !/withAuth\(/.test(f.src) && !f.src.includes('from "@/server/rbac/guard"'));
    expect(unguarded.map((f) => f.rel)).toEqual([]);
  });

  it("public routes are only the allowlisted ones (a new public route needs a deliberate edit here)", () => {
    const publicRoutes = files.filter((f) => !/withAuth\(/.test(f.src)).map((f) => f.rel).sort();
    expect(publicRoutes).toEqual([...PUBLIC_ROUTES].sort());
  });

  it("the allowlist has no stale entries", () => {
    const existing = files.map((f) => f.rel);
    for (const p of PUBLIC_ROUTES) expect(existing).toContain(p);
  });

  it("no route reads body metrics or private notes without going through the privacy projections", () => {
    const offenders = files.filter((f) => /schema/.test(f.src) && /bodyMetrics\b|privateNotes\b/.test(f.src) && !/@\/server\/privacy/.test(f.src));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });
});
