import { describe, expect, it } from "vitest";
import { toPublicSession } from "@/server/auth/public-session";

describe("toPublicSession", () => {
  it("exposes only expires and safe user fields (no token, no password hash)", () => {
    const out = toPublicSession(
      { expires: new Date("2026-12-20"), sessionToken: "SECRET-TOKEN", userId: "u1", id: "s1" } as never,
      { id: "u1", role: "MEMBER", name: "A", email: "a@example.com", passwordHash: "$argon2id$secret", disabled: false },
    );
    expect(Object.keys(out).sort()).toEqual(["expires", "user"]);
    expect(Object.keys(out.user).sort()).toEqual(["email", "id", "name", "role"]);
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRET-TOKEN");
    expect(json).not.toContain("argon2id");
  });
});
