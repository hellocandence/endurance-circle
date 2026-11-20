import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Editable profile fields. `.strict()` means role, email, disabled and friends can never be sent
 * (no privilege escalation by mass assignment).
 */
export const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    timeZone: z.string().trim().max(64).refine(validZone, "Unknown time zone"),
    bio: z.string().trim().max(280).nullable(),
  })
  .partial()
  .strict();

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export type ProfileView = { id: string; name: string; email: string; role: "OWNER" | "MEMBER"; timeZone: string; bio: string | null; avatarPhotoId: string | null };

export async function getProfile(db: Db, userId: string): Promise<ProfileView | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, timeZone: users.timeZone, bio: profiles.bio, avatarPhotoId: profiles.avatarPhotoId })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function updateProfile(db: Db, userId: string, patch: ProfilePatch): Promise<ProfileView | null> {
  const userSet = { ...(patch.name !== undefined && { name: patch.name }), ...(patch.timeZone !== undefined && { timeZone: patch.timeZone }) };
  if (Object.keys(userSet).length > 0) await db.update(users).set(userSet).where(eq(users.id, userId));
  if (patch.bio !== undefined) {
    await db
      .insert(profiles)
      .values({ userId, bio: patch.bio })
      .onConflictDoUpdate({ target: profiles.userId, set: { bio: patch.bio } });
  }
  return getProfile(db, userId);
}
