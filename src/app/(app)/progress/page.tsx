import { redirect } from "next/navigation";
import { ProgressList } from "@/components/ProgressList";
import { requestNow } from "@/server/clock";
import { getProgressList } from "@/server/dashboard/public";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";

export const metadata = { title: "Progress · Cadence" };
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const rows = await getProgressList(getDb(), await requestNow());
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
        <p className="text-ink-muted">Completed days out of days so far. Today counts once it is done.</p>
      </header>
      <ProgressList rows={rows} meId={actor.id} />
    </div>
  );
}
