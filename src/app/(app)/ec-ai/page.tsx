import { redirect } from "next/navigation";
import { EcGroupCard } from "@/components/ec/EcGroupCard";
import { EcOverview } from "@/components/ec/EcOverview";
import { EcReminders } from "@/components/ec/EcReminders";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";
import { getGroupSettings, getMySettings, listOverview } from "@/server/ec/service";
import { getProfile } from "@/server/profile/service";

export const metadata = { title: "EC AI · Endurance Circle" };
export const dynamic = "force-dynamic";

export default async function EcAiPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const db = getDb();
  const owner = actor.role === "OWNER";
  const [mine, group, profile, overview] = await Promise.all([getMySettings(db, actor.id), getGroupSettings(db), getProfile(db, actor.id), owner ? listOverview(db) : Promise.resolve(null)]);
  if (!profile) redirect("/login");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">EC AI</h1>
        <p className="text-ink-muted">WhatsApp reminders for the circle. The bot tags whoever still has tasks to finish.</p>
      </div>
      <EcGroupCard group={group} isOwner={owner} />
      <EcReminders mine={mine} />
      {overview && <EcOverview members={overview} />}
    </div>
  );
}
