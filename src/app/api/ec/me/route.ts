import { getDb } from "@/server/db";
import { readMine, writeMine } from "@/server/ec/handlers";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

const own = { resource: ({ user }: { user: { id: string } }) => ({ kind: "ec_reminder" as const, ownerId: user.id }) };

// The caller's own reminder settings. No user id in the URL.
export const GET = withAuth({ action: "read", ...own }, (_req, { user }) => readMine(getDb(), user.id));
export const PUT = withAuth({ action: "write", ...own }, (req, { user }) => writeMine(getDb(), user.id, req));
