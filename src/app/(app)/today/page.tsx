import { redirect } from "next/navigation";
import { CohortStart } from "@/components/today/CohortStart";
import { ScheduledStart } from "@/components/today/ScheduledStart";
import { StartProgram } from "@/components/today/StartProgram";
import { TodayScreen } from "@/components/today/TodayScreen";
import { requestNow } from "@/server/clock";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";
import { trackerPayload } from "@/server/tracker/respond";
import { cohortOpen, getProgramme, getToday } from "@/server/tracker/service";

export const metadata = { title: "Today · Endurance Circle" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const { body } = trackerPayload(actor, await getToday(getDb(), actor.id, await requestNow()));
  if ("error" in body) {
    if (body.error === "not_started_yet") {
      const programme = await getProgramme(getDb(), actor.id, await requestNow());
      if (programme) return <ScheduledStart startDate={programme.startDate} daysUntil={programme.daysUntilStart} />;
    }
    const cohort = await cohortOpen(getDb(), actor.id, await requestNow());
    if (cohort.open) return <CohortStart startDate={cohort.startDate} today={cohort.today} />;
    return <StartProgram />;
  }
  return <TodayScreen key={body.date} data={body} userId={actor.id} />;
}
