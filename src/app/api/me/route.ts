import { NextResponse } from "next/server";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// The signed-in user's own safe identity fields.
export const GET = withAuth(
  { action: "read", resource: ({ user }) => ({ kind: "profile", ownerId: user.id }) },
  (_req, { user }) => NextResponse.json({ id: user.id, role: user.role, name: user.name, email: user.email }),
);
