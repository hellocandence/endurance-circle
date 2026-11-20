import { describe, expect, it } from "vitest";
import { buildCsp, newNonce, staticSecurityHeaders } from "@/server/http/security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp (production)", () => {
  const csp = buildCsp("abc123", { dev: false });

  it("allows scripts only with the request's nonce: no unsafe-inline, no unsafe-eval", () => {
    const script = directive(csp, "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).not.toContain("strict-dynamic"); // would trust script-created scripts from any origin
    expect(script).not.toMatch(/https?:|\*/); // same origin only
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
  });

  it("locks everything else down", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "worker-src")).toBe("worker-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows Google only as an OAuth form target (self + Google OAuth)", () => {
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://accounts.google.com");
    expect(csp.match(/accounts\.google\.com/g)).toHaveLength(1);
    expect(csp).not.toMatch(/https?:\/\/(?!accounts\.google\.com)[a-z]/i); // no other external origin anywhere
  });

  it("permits the crop preview (blob:) for images only", () => {
    expect(directive(csp, "img-src")).toBe("img-src 'self' blob: data:");
    expect(directive(csp, "script-src")).not.toContain("blob:");
  });
});

describe("buildCsp (development)", () => {
  const csp = buildCsp("n", { dev: true });
  it("adds only what the dev tooling needs", () => {
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
  });
});

describe("static security headers", () => {
  const h = Object.fromEntries(staticSecurityHeaders.map((x) => [x.key, x.value]));
  it("has HSTS, nosniff, Referrer-Policy and the framing and feature policies", () => {
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}; includeSubDomains/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });
});

describe("newNonce", () => {
  it("is unique, base64 and long enough to be unguessable", () => {
    const nonces = new Set(Array.from({ length: 200 }, newNonce));
    expect(nonces.size).toBe(200);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/); // 16 random bytes
  });
});
