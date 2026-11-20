import { getDb } from "@/server/db";
import { readProfile, writeProfile } from "@/server/profile/handlers";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

const own = { resource: ({ user }: { user: { id: string } }) => ({ kind: "profile" as const, ownerId: user.id }) };

// The caller's own profile. No user id in the URL.
export const GET = withAuth({ action: "read", ...own }, (_req, { user }) => readProfile(getDb(), user.id));
export const PATCH = withAuth({ action: "write", ...own }, (req, { user }) => writeProfile(getDb(), user.id, req));
