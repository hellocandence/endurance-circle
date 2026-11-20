import type { Actor } from "@/server/rbac/can";
import { auth } from "./index";

/** The signed-in user as an RBAC actor, or null. Disabled users never resolve (adapter). */
export async function sessionActor(): Promise<(Actor & { name: string; email: string }) | null> {
  const session = await auth();
  const u = session?.user;
  return u ? { id: u.id, role: u.role, name: u.name, email: u.email } : null;
}
