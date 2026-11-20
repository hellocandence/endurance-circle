import { NextResponse } from "next/server";

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

/**
 * Sliding-window limiter, in memory. Fine for the single Render instance Cadence runs on; counters
 * reset on restart. Move to Postgres if the app ever runs on more than one instance.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of hits) {
      if (times[times.length - 1] <= now - opts.windowMs) hits.delete(key);
    }
  }

  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => t > now - opts.windowMs);
  const verdict = (times: number[], now: number): LimitResult =>
    times.length >= opts.limit
      ? { allowed: false, retryAfterSec: Math.max(1, Math.ceil((times[0] + opts.windowMs - now) / 1000)) }
      : { allowed: true };

  return {
    /** Would an attempt be allowed right now? Records nothing (for failure-only counters). */
    peek(key: string, now = Date.now()): LimitResult {
      return verdict(recent(key, now), now);
    },
    /** Record one attempt without checking (call after a failure). */
    record(key: string, now = Date.now()) {
      const times = recent(key, now);
      times.push(now);
      hits.set(key, times);
      if (hits.size > 10_000) prune(now);
    },
    /** Records an attempt if allowed. Rejected attempts are not recorded, so they do not extend the lockout. */
    check(key: string, now = Date.now()): LimitResult {
      const times = (hits.get(key) ?? []).filter((t) => t > now - opts.windowMs);
      if (times.length >= opts.limit) {
        hits.set(key, times);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((times[0] + opts.windowMs - now) / 1000)) };
      }
      times.push(now);
      hits.set(key, times);
      if (hits.size > 10_000) prune(now);
      return { allowed: true };
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * Best-effort client address. Render fronts apps with Cloudflare, which sets cf-connecting-ip itself
 * (clients cannot forge it). Fall back to the last (proxy-appended) X-Forwarded-For entry.
 * Per-email limits do not depend on this, so a spoofed address cannot unlock unlimited guessing.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",").at(-1)!.trim();
  return "unknown";
}

export function tooManyRequests(retryAfterSec: number) {
  return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}

/** Like `enforce`, but only looks: nothing is counted. Pair with `limiter.record(key)` on failure. */
export function enforcePeek(checks: Array<[RateLimiter, string]>): NextResponse | null {
  for (const [limiter, key] of checks) {
    const r = limiter.peek(key);
    if (!r.allowed) return tooManyRequests(r.retryAfterSec);
  }
  return null;
}

/** First rejected limiter wins; limiters before it have already counted this attempt (acceptable). */
export function enforce(checks: Array<[RateLimiter, string]>): NextResponse | null {
  for (const [limiter, key] of checks) {
    const r = limiter.check(key);
    if (!r.allowed) return tooManyRequests(r.retryAfterSec);
  }
  return null;
}
