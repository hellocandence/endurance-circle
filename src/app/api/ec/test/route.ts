import { getDb } from "@/server/db";
import { testMine } from "@/server/ec/handlers";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Sends a test WhatsApp message to the caller's own number (tags only them).
export const POST = withAuth({ action: "write", resource: ({ user }) => ({ kind: "ec_reminder", ownerId: user.id }) }, (_req, { user }) => testMine(getDb(), user.id));
