import Link from "next/link";
import { redirect } from "next/navigation";
import { BodyLimitsForm } from "@/components/settings/BodyLimitsForm";
import { PhotoUploader } from "@/components/settings/PhotoUploader";
import { SecurityForm } from "@/components/settings/SecurityForm";
import { AdminPanel } from "@/components/settings/AdminPanel";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { sessionActor } from "@/server/auth/session-user";
import { listMembers } from "@/server/admin/service";
import { listInvites } from "@/server/auth/invites";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getBodyRow } from "@/server/body/service";
import { getDb } from "@/server/db";
import { bodyMetrics } from "@/server/privacy";
import { getProfile } from "@/server/profile/service";

export const metadata = { title: "Settings · Cadence" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const profile = await getProfile(getDb(), actor.id);
  const row = await getBodyRow(getDb(), actor.id);
  const [{ passwordHash }] = await getDb().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actor.id)).limit(1);
  if (!profile || !row) redirect("/login");
  const body = bodyMetrics(actor, actor.id, row); // own data, through the projection

  // Circle admin data is only loaded for the owner (the API routes enforce it again).
  const admin = actor.role === "OWNER" ? { invites: await listInvites(getDb()), members: await listMembers(getDb()) } : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <ProfileForm profile={profile} />
      <Link href="/install" className="glass glass-focus rounded-2xl p-4 text-center font-medium text-accent-strong">Install Cadence on your phone</Link>
      <PhotoUploader userId={profile.id} avatarPhotoId={profile.avatarPhotoId} name={profile.name} />
      <BodyLimitsForm body={body} />
      <SecurityForm hasPassword={passwordHash !== null} />
      {admin && <AdminPanel invites={admin.invites} members={admin.members} meId={actor.id} />}
    </div>
  );
}
