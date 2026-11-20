import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (no open redirects)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/today")).toBe("/today");
    expect(safeNext("/settings?tab=security")).toBe("/settings?tab=security");
  });
  it("falls back for anything that could leave the site", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "", null, undefined, "/ok\r\nSet-Cookie: x=1", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/evil.com", "/\\/evil.com", "/ok\\evil.com"]) {
      expect(safeNext(bad as string | null | undefined)).toBe("/dashboard");
    }
  });
});
