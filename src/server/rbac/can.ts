// Permission function from docs/04-RBAC-DATA-MODEL.md §3. Default deny: every combination that is
// not explicitly allowed below returns false, including unknown kinds, actions and malformed input.

export type Role = "OWNER" | "MEMBER";
export type Action = "read" | "write" | "invite" | "remove" | "admin";

export type Resource =
  | { kind: "circle.public" }
  | { kind: "journey"; ownerId: string }
  | { kind: "body"; ownerId: string }
  | { kind: "tracker"; ownerId: string }
  | { kind: "profile"; ownerId: string }
  | { kind: "avatar"; ownerId: string } // the public 128 px picture shown on cards
  | { kind: "photo"; ownerId: string } // the full 512 px profile photo
  | { kind: "invite" }
  | { kind: "challenge" } // restart anyone's 75 Hard: owner only
  | { kind: "ec_reminder"; ownerId: string } // a member's WhatsApp number and reminder times
  | { kind: "ec_group" } // the owner's daily reminder to the whole WhatsApp group
  | { kind: "member"; memberId: string };

export type Actor = { id: string; role: Role };

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function can(user: Actor | null | undefined, action: Action, r: Resource): boolean {
  if (!user || !nonEmpty(user.id) || (user.role !== "OWNER" && user.role !== "MEMBER")) return false;
  if (!r || typeof r !== "object") return false;

  const owner = user.role === "OWNER";
  // Identity is compared only between two real, non-empty strings.
  const isSelf = (id: unknown) => nonEmpty(id) && id === user.id;

  switch (r.kind) {
    case "circle.public":
      return action === "read"; // any signed-in user

    case "journey": // private daily logs (incl. private_notes)
    case "profile":
      if (action === "read") return owner || isSelf(r.ownerId);
      if (action === "write") return isSelf(r.ownerId); // nobody edits someone else's
      return false;

    case "body": // BR3: the member and the owner only; only the member edits
    case "tracker": // the owner can read a member's tracker but never edit it
      if (action === "read") return owner || isSelf(r.ownerId);
      if (action === "write") return isSelf(r.ownerId);
      return false;

    case "avatar":
      return action === "read"; // every signed-in member sees everyone's avatar

    case "photo":
      if (action === "read") return owner || isSelf(r.ownerId);
      if (action === "write") return isSelf(r.ownerId);
      return false;

    case "invite": // create, revoke, list: owner only
      return owner && (action === "invite" || action === "read" || action === "admin");

    case "challenge":
      return owner && action === "admin";

    case "ec_reminder": // the number is private: the member and the owner read it, only the member edits
      if (action === "read") return owner || isSelf(r.ownerId);
      if (action === "write") return isSelf(r.ownerId);
      return false;

    case "ec_group":
      if (action === "read") return true; // every member sees when the group reminder goes out
      return owner && action === "admin";

    case "member":
      // Removing a member: owner only, never the owner themselves (BR2). Role changes: nobody (single owner in v1).
      if (action === "remove") return owner && nonEmpty(r.memberId) && !isSelf(r.memberId);
      if (action === "read") return owner;
      return false;

    default:
      return false;
  }
}
