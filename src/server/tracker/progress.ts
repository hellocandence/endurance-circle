import { addDays } from "./dates";
import { dayNumber } from "./rules";

export type DayRecord = { date: string; completed: boolean };

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
 * Completion % = completed days ÷ elapsed days (docs/04 §6). Today only counts as elapsed once it is
 * completed, so the percentage does not dip during an unfinished day. The window is capped at totalDays.
 * `lastDays` limits it to the most recent days (e.g. 7).
 */
export function completion(
  days: DayRecord[],
  opts: { startDate: string; today: string; totalDays?: number; lastDays?: number },
): Completion {
  const total = opts.totalDays ?? 75;
  const todayNo = dayNumber(opts.startDate, opts.today);
  if (todayNo === null) return { completed: 0, elapsed: 0, pct: 0 };

  const doneDates = new Set(days.filter((d) => d.completed).map((d) => d.date));
  const lastDayNo = Math.min(total, doneDates.has(opts.today) ? todayNo : todayNo - 1);
  if (lastDayNo < 1) return { completed: 0, elapsed: 0, pct: 0 };

  const firstDayNo = opts.lastDays ? Math.max(1, lastDayNo - opts.lastDays + 1) : 1;
  let completed = 0;
  for (let n = firstDayNo; n <= lastDayNo; n++) if (doneDates.has(addDays(opts.startDate, n - 1))) completed++;
  const elapsed = lastDayNo - firstDayNo + 1;
  return { completed, elapsed, pct: Math.round((completed / elapsed) * 100) };
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
