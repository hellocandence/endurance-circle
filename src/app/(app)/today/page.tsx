import { redirect } from "next/navigation";
import { StartProgram } from "@/components/today/StartProgram";
import { TodayScreen } from "@/components/today/TodayScreen";
import { requestNow } from "@/server/clock";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";
import { trackerPayload } from "@/server/tracker/respond";
import { getToday } from "@/server/tracker/service";

export const metadata = { title: "Today · Cadence" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const { body } = trackerPayload(actor, await getToday(getDb(), actor.id, await requestNow()));
  if ("error" in body) return <StartProgram />;
  return <TodayScreen key={body.date} data={body} userId={actor.id} />;
}
