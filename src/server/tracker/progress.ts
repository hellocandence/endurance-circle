import { addDays } from "./dates";
import { dayNumber } from "./rules";

/** doneCount/requiredCount (saved with each day) let a partly done day count for what was done; without them a day is all or nothing. */
export type DayRecord = { date: string; completed: boolean; doneCount?: number; requiredCount?: number };

/**
 * "Perfect days in a row": consecutive completed days ending today, or ending yesterday while today is
 * still in progress (today never breaks the run). This is separate from the day number, which never
 * resets (BR4 and the owner decision that missed tasks do not reset the streak).
 */
export function perfectDaysInARow(days: DayRecord[], today: string): number {
  const done = new Set(days.filter((d) => d.completed).map((d) => d.date));
  let cursor = done.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export type Completion = { completed: number; elapsed: number; pct: number };

/**
 * Completion % = the average share of tasks done per day over the window (a day with 7 of 10 tasks is 70%, a
 * day with nothing logged is 0%). `completed` still counts the fully finished days. Today joins the window as
 * soon as something is ticked (or it is completed), so the % never sits at 0 while a day is under way, but an
 * untouched today does not drag it down. The window is capped at totalDays. `lastDays` limits it to the most recent days (e.g. 7).
 */
export function completion(
  days: DayRecord[],
  opts: { startDate: string; today: string; totalDays?: number; lastDays?: number },
): Completion {
  const total = opts.totalDays ?? 75;
  const todayNo = dayNumber(opts.startDate, opts.today);
  if (todayNo === null) return { completed: 0, elapsed: 0, pct: 0 };

  const byDate = new Map(days.map((d) => [d.date, d]));
  const score = (d?: DayRecord) => (!d ? 0 : d.completed ? 1 : d.requiredCount ? Math.min(d.doneCount ?? 0, d.requiredCount) / d.requiredCount : 0);
  const todayStarted = score(byDate.get(opts.today)) > 0;
  const lastDayNo = Math.min(total, todayStarted ? todayNo : todayNo - 1);
  if (lastDayNo < 1) return { completed: 0, elapsed: 0, pct: 0 };

  const firstDayNo = opts.lastDays ? Math.max(1, lastDayNo - opts.lastDays + 1) : 1;
  let completed = 0;
  let points = 0;
  for (let n = firstDayNo; n <= lastDayNo; n++) {
    const d = byDate.get(addDays(opts.startDate, n - 1));
    if (d?.completed) completed++;
    points += score(d);
  }
  const elapsed = lastDayNo - firstDayNo + 1;
  return { completed, elapsed, pct: Math.round((points / elapsed) * 100) };
}

/** Longest run of consecutive completed days ever (used in the Day 75 summary). */
export function longestPerfectRun(days: DayRecord[]): number {
  const done = [...new Set(days.filter((d) => d.completed).map((d) => d.date))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of done) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
