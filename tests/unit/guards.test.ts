import { describe, expect, it } from "vitest";
import { rejectUnsafeRequest } from "@/server/http/guards";

const env = { AUTH_URL: "https://cadence.example.com" };
const req = (headers: Record<string, string>) =>
  new Request("https://cadence.example.com/api/login", { method: "POST", headers, body: "{}" });
const status = (r: ReturnType<typeof rejectUnsafeRequest>) => r?.status ?? null;

describe("rejectUnsafeRequest", () => {
  it("allows same-origin JSON and header-less API clients", () => {
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/json", origin: env.AUTH_URL }), env))).toBeNull();
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/json; charset=utf-8" }), env))).toBeNull();
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/json", "sec-fetch-site": "same-origin" }), env))).toBeNull();
  });

  it("rejects non-JSON bodies (the text/plain form-post trick)", () => {
    expect(status(rejectUnsafeRequest(req({ "content-type": "text/plain" }), env))).toBe(415);
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/x-www-form-urlencoded" }), env))).toBe(415);
    expect(status(rejectUnsafeRequest(req({}), env))).toBe(415);
  });

  it("rejects cross-site requests", () => {
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/json", origin: "https://evil.example" }), env))).toBe(403);
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/json", "sec-fetch-site": "cross-site" }), env))).toBe(403);
    expect(status(rejectUnsafeRequest(req({ "content-type": "application/json", origin: "https://cadence.example.com.evil.example" }), env))).toBe(403);
  });
});
