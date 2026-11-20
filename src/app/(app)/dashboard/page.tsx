import { redirect } from "next/navigation";
import { DashboardScreen } from "@/components/dashboard/DashboardScreen";
import { requestNow } from "@/server/clock";
import { getPublicDashboard } from "@/server/dashboard/public";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";
import { privateJourney } from "@/server/privacy";
import { getJourneyRows } from "@/server/tracker/journey";

export const metadata = { title: "Circle · Cadence" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const now = await requestNow();
  const db = getDb();

  const [{ members, pulse }, mine] = await Promise.all([getPublicDashboard(db, now), getJourneyRows(db, actor.id, now)]);
  const journey = {
    programme: mine?.programme ?? null,
    stats: mine?.stats ?? null,
    logs: privateJourney(actor, actor.id, (mine?.rows ?? []).slice(0, 7)).logs, // own data, through the projection
  };

  return <DashboardScreen members={members.map((m) => ({ ...m, isMe: m.id === actor.id }))} pulse={pulse} journey={journey} />;
}
