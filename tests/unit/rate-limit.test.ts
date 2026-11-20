import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter, enforce } from "@/server/http/rate-limit";

const MIN = 60_000;

describe("createRateLimiter", () => {
  it("allows `limit` attempts then blocks, with Retry-After", () => {
    const l = createRateLimiter({ limit: 3, windowMs: 15 * MIN });
    const t0 = 1_000_000;
    expect(l.check("k", t0).allowed).toBe(true);
    expect(l.check("k", t0 + MIN).allowed).toBe(true);
    expect(l.check("k", t0 + 2 * MIN).allowed).toBe(true);
    const blocked = l.check("k", t0 + 3 * MIN);
    expect(blocked).toEqual({ allowed: false, retryAfterSec: 12 * 60 }); // oldest hit leaves the window at t0+15min
  });

  it("slides: capacity returns as old attempts age out", () => {
    const l = createRateLimiter({ limit: 2, windowMs: 10 * MIN });
    l.check("k", 0);
    l.check("k", 1 * MIN);
    expect(l.check("k", 5 * MIN).allowed).toBe(false);
    expect(l.check("k", 10 * MIN + 1).allowed).toBe(true); // first hit expired
    expect(l.check("k", 10 * MIN + 2).allowed).toBe(false);
  });

  it("rejected attempts do not extend the lockout", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 10 * MIN });
    l.check("k", 0);
    for (let i = 1; i < 50; i++) l.check("k", i * 1000);
    expect(l.check("k", 10 * MIN + 1).allowed).toBe(true);
  });

  it("keys are independent and reset clears one", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 10 * MIN });
    expect(l.check("a", 0).allowed).toBe(true);
    expect(l.check("b", 0).allowed).toBe(true);
    expect(l.check("a", 1).allowed).toBe(false);
    l.reset("a");
    expect(l.check("a", 2).allowed).toBe(true);
  });
});

describe("peek / record (failure-only counters)", () => {
  it("peek never counts, record does", () => {
    const l = createRateLimiter({ limit: 2, windowMs: 10 * MIN });
    for (let i = 0; i < 20; i++) expect(l.peek("k", i).allowed).toBe(true); // looking is free
    l.record("k", 100);
    expect(l.peek("k", 101).allowed).toBe(true);
    l.record("k", 102);
    expect(l.peek("k", 103)).toEqual({ allowed: false, retryAfterSec: Math.ceil((100 + 10 * MIN - 103) / 1000) });
    expect(l.peek("k", 100 + 10 * MIN + 1).allowed).toBe(true); // first failure aged out
  });
});

describe("enforce", () => {
  it("returns a 429 with Retry-After once any limiter trips", async () => {
    const l = createRateLimiter({ limit: 1, windowMs: 15 * MIN });
    expect(enforce([[l, "x"]])).toBeNull();
    const res = enforce([[l, "x"]])!;
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });
});

describe("clientIp", () => {
  const r = (h: Record<string, string>) => new Request("http://x", { headers: h });
  it("prefers Cloudflare's header, then x-real-ip, then the last X-Forwarded-For hop", () => {
    expect(clientIp(r({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(r({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" }))).toBe("2.2.2.2");
    expect(clientIp(r({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }))).toBe("3.3.3.3"); // leftmost is client-supplied
    expect(clientIp(r({}))).toBe("unknown");
  });
});
