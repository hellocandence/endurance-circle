import { cache } from "react";
import type { Actor } from "@/server/rbac/can";
import { auth } from "./index";

/** `auth()` once per request: the layout and the page share the result instead of each querying the database. */
export const getSession = cache(() => auth());

/** The signed-in user as an RBAC actor, or null. Disabled users never resolve (adapter). */
export async function sessionActor(): Promise<(Actor & { name: string; email: string }) | null> {
  const session = await getSession();
  const u = session?.user;
  return u ? { id: u.id, role: u.role, name: u.name, email: u.email } : null;
}
