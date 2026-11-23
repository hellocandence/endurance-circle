import type { DailyLogDay } from "@/server/dashboard/daily-logs";

const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const badge = { done: "bg-emerald-100 text-emerald-900", today: "bg-indigo-100 text-indigo-900", missed: "bg-rose-100 text-rose-900" } as const;
const word = { done: "Complete", today: "In progress", missed: "Incomplete" } as const;

const yes = (v: boolean) => (v ? "Done" : "Not done");
const text = (v: string | null) => (v && v.trim() ? v : null);

/** Every field the member saved for one day. Finished days are locked, so this is the final record. */
export function DayLogCard({ day, open = false }: { day: DailyLogDay; open?: boolean }) {
  const log = day.log;
  const facts: [string, string][] = log
    ? [
        ...(log.isSunday
          ? ([["Stretch", `${log.stretchMin} min`]] as [string, string][])
          : ([["Run", `${log.runKm} km`], ["Warm-up", yes(log.warmupPreDone)], ["Cool-down", yes(log.warmupPostDone)]] as [string, string][])),
        ["Water", `${log.waterL} L`],
        ["Electrolytes", yes(log.electrolytesDone)],
        ["Protein", `${log.proteinG} g`],
        ["Study", `${log.studyMin} min`],
        ["GitHub", yes(log.githubContribution)],
        ["Reading", `${log.readingMin} min`],
      ]
    : [];
  const notes: [string, string | null][] = log
    ? [["Study topic", text(log.studyTopic)], ["Tech tip", text(log.techNote)], ["Reading title", text(log.readingTitle)], ["Update for the circle", text(log.updateText)], ["Note", text(log.privateNotes)]]
    : [];

  return (
    <details open={open} className="group rounded-2xl bg-white/50 p-3">
      <summary className="glass-focus flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl">
        <span className="font-medium">
          Day {day.n} <span className="font-normal text-ink-muted">· {dateFmt.format(new Date(`${day.date}T00:00:00Z`))}</span>
        </span>
        <span className="flex items-center gap-2">
          {day.locked && <span className="text-xs text-ink-muted">Locked</span>}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[day.state]}`}>
            {day.done}/{day.required} · {word[day.state]}
          </span>
        </span>
      </summary>

      <ul aria-label={`Tasks on day ${day.n}`} className="mt-3 flex flex-wrap gap-1.5">
        {day.tasks.map((t) => (
          <li key={t.key} className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.done ? "bg-accent text-white" : "border border-ink-muted/30 text-ink-muted"}`}>
            <span aria-hidden="true">{t.done ? "✓ " : ""}</span>
            {t.label}
            <span className="sr-only">{t.done ? " done" : " not done"}</span>
          </li>
        ))}
      </ul>

      {log ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {notes.some(([, v]) => v) && (
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {notes.filter(([, v]) => v).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Nothing was logged this day.</p>
      )}
    </details>
  );
}
