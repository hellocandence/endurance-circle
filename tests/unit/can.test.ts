import { describe, expect, it } from "vitest";
import { can, type Action, type Actor, type Resource } from "@/server/rbac/can";

const owner: Actor = { id: "owner-1", role: "OWNER" };
const alice: Actor = { id: "alice", role: "MEMBER" };
const bob: Actor = { id: "bob", role: "MEMBER" };

type Row = { name: string; action: Action; resource: (subjectId: string) => Resource; owner: boolean; self: boolean; other: boolean; guest?: false };
// For rows about someone's data: `self` = a member acting on their own data, `other` = a member acting on a different member's.
const rows: Row[] = [
  { name: "read public circle feed", action: "read", resource: () => ({ kind: "circle.public" }), owner: true, self: true, other: true },
  { name: "read private journey", action: "read", resource: (id) => ({ kind: "journey", ownerId: id }), owner: true, self: true, other: false },
  { name: "read body metrics", action: "read", resource: (id) => ({ kind: "body", ownerId: id }), owner: true, self: true, other: false },
  { name: "edit body limits", action: "write", resource: (id) => ({ kind: "body", ownerId: id }), owner: false, self: true, other: false },
  { name: "edit profile", action: "write", resource: (id) => ({ kind: "profile", ownerId: id }), owner: false, self: true, other: false },
  { name: "read profile", action: "read", resource: (id) => ({ kind: "profile", ownerId: id }), owner: true, self: true, other: false },
  { name: "read tracker", action: "read", resource: (id) => ({ kind: "tracker", ownerId: id }), owner: true, self: true, other: false },
  { name: "edit tracker", action: "write", resource: (id) => ({ kind: "tracker", ownerId: id }), owner: false, self: true, other: false },
  { name: "write private journey", action: "write", resource: (id) => ({ kind: "journey", ownerId: id }), owner: false, self: true, other: false },
  { name: "upload photo", action: "write", resource: (id) => ({ kind: "photo", ownerId: id }), owner: false, self: true, other: false },
  { name: "view full photo", action: "read", resource: (id) => ({ kind: "photo", ownerId: id }), owner: true, self: true, other: false },
  { name: "view avatar", action: "read", resource: (id) => ({ kind: "avatar", ownerId: id }), owner: true, self: true, other: true },
];

describe("permission matrix (docs/04 §2)", () => {
  for (const row of rows) {
    describe(row.name, () => {
      it(`owner acting on a member's data → ${row.owner}`, () => expect(can(owner, row.action, row.resource("alice"))).toBe(row.owner));
      it(`owner acting on their own data → owner can read all; own write allowed for write rows`, () => {
        const expected = row.action === "write" ? row.name.startsWith("edit") || row.name.startsWith("upload") || row.name.startsWith("write") : true;
        expect(can(owner, row.action, row.resource(owner.id))).toBe(expected);
      });
      it(`member on own data → ${row.self}`, () => expect(can(alice, row.action, row.resource("alice"))).toBe(row.self));
      it(`member on another member's data → ${row.other}`, () => expect(can(bob, row.action, row.resource("alice"))).toBe(row.other));
      it("guest (not logged in) → false", () => {
        expect(can(null, row.action, row.resource("alice"))).toBe(false);
        expect(can(undefined, row.action, row.resource("alice"))).toBe(false);
      });
    });
  }
});

describe("invites and members (owner only)", () => {
  const inviteActions: Action[] = ["invite", "read", "admin"];
  it("owner can create, list and revoke invites", () => {
    for (const a of inviteActions) expect(can(owner, a, { kind: "invite" })).toBe(true);
  });
  it("members and guests cannot touch invites (AT-08)", () => {
    for (const a of ["read", "write", "invite", "remove", "admin"] as Action[]) {
      expect(can(alice, a, { kind: "invite" })).toBe(false);
      expect(can(null, a, { kind: "invite" })).toBe(false);
    }
  });
  it("owner can remove a member; members cannot (AT-08)", () => {
    expect(can(owner, "remove", { kind: "member", memberId: "alice" })).toBe(true);
    expect(can(alice, "remove", { kind: "member", memberId: "bob" })).toBe(false);
    expect(can(alice, "remove", { kind: "member", memberId: "alice" })).toBe(false);
    expect(can(null, "remove", { kind: "member", memberId: "alice" })).toBe(false);
  });
  it("nobody can remove the owner, not even the owner (BR2)", () => {
    expect(can(owner, "remove", { kind: "member", memberId: owner.id })).toBe(false);
    expect(can(alice, "remove", { kind: "member", memberId: owner.id })).toBe(false);
  });
  it("nobody can change a member's role (single owner in v1)", () => {
    for (const u of [owner, alice, null]) expect(can(u, "admin", { kind: "member", memberId: "alice" })).toBe(false);
  });
  it("only the owner can read the member list", () => {
    expect(can(owner, "read", { kind: "member", memberId: "alice" })).toBe(true);
    expect(can(alice, "read", { kind: "member", memberId: "alice" })).toBe(false);
  });
});

describe("the owner can read but never edit another member's data", () => {
  it("body metrics: readable (owner decision), not editable", () => {
    expect(can(owner, "read", { kind: "body", ownerId: "alice" })).toBe(true);
    expect(can(owner, "write", { kind: "body", ownerId: "alice" })).toBe(false);
  });
  it("tracker: readable, not editable", () => {
    expect(can(owner, "read", { kind: "tracker", ownerId: "alice" })).toBe(true);
    expect(can(owner, "write", { kind: "tracker", ownerId: "alice" })).toBe(false);
  });
});

describe("default deny", () => {
  const everyAction: Action[] = ["read", "write", "invite", "remove", "admin"];

  it("rejects unsupported action/resource combinations", () => {
    for (const a of ["invite", "remove", "admin"] as Action[]) {
      for (const r of [{ kind: "journey", ownerId: "alice" }, { kind: "body", ownerId: "alice" }, { kind: "tracker", ownerId: "alice" }, { kind: "profile", ownerId: "alice" }, { kind: "circle.public" }] as Resource[]) {
        expect(can(owner, a, r)).toBe(false);
        expect(can(alice, a, r)).toBe(false);
      }
    }
    expect(can(owner, "write", { kind: "circle.public" })).toBe(false);
    expect(can(alice, "write", { kind: "avatar", ownerId: "alice" })).toBe(false);
  });

  it("rejects unknown resource kinds and unknown actions", () => {
    expect(can(owner, "read", { kind: "secrets" } as unknown as Resource)).toBe(false);
    expect(can(owner, "delete" as Action, { kind: "journey", ownerId: "alice" })).toBe(false);
    expect(can(owner, "read", null as unknown as Resource)).toBe(false);
    expect(can(owner, "read", "journey" as unknown as Resource)).toBe(false);
  });

  it("rejects malformed users (bad role, missing id)", () => {
    for (const u of [{ id: "x", role: "ADMIN" }, { id: "", role: "OWNER" }, { id: "x" }, { role: "OWNER" }, {}, "OWNER", 5] as unknown[]) {
      for (const a of everyAction) expect(can(u as Actor, a, { kind: "circle.public" })).toBe(false);
    }
  });

  it("never treats a missing ownerId as a match for a missing user id", () => {
    const noOwner = { kind: "body" } as unknown as Resource;
    expect(can(alice, "read", noOwner)).toBe(false);
    expect(can(alice, "write", noOwner)).toBe(false);
    expect(can({ id: "", role: "MEMBER" }, "read", { kind: "body", ownerId: "" })).toBe(false);
  });

  it("id comparison is exact (no case folding, no coercion)", () => {
    expect(can(alice, "read", { kind: "body", ownerId: "Alice" })).toBe(false);
    expect(can(alice, "read", { kind: "body", ownerId: "alice " })).toBe(false);
    expect(can(alice, "read", { kind: "body", ownerId: 7 as unknown as string })).toBe(false);
  });
});

describe("challenge restart (owner only)", () => {
  const owner = { id: "o1", role: "OWNER" as const };
  const member = { id: "m1", role: "MEMBER" as const };
  it("only the owner can administer challenges, and only with the admin action", () => {
    expect(can(owner, "admin", { kind: "challenge" })).toBe(true);
    for (const a of ["read", "write", "invite", "remove"] as const) expect(can(owner, a, { kind: "challenge" })).toBe(false);
    for (const a of ["read", "write", "invite", "remove", "admin"] as const) {
      expect(can(member, a, { kind: "challenge" })).toBe(false);
      expect(can(null, a, { kind: "challenge" })).toBe(false);
    }
  });
});
