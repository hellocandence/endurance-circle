type Role = "OWNER" | "MEMBER";

/**
 * The only shape that may reach the client. Built field by field because the adapter hands us raw DB
 * rows: the session row holds the session token and the user row holds password_hash.
 */
export function toPublicSession(session: { expires: Date }, user: unknown) {
  const u = user as { id: string; role: Role; name: string; email: string };
  return { expires: session.expires, user: { id: u.id, role: u.role, name: u.name, email: u.email } };
}
