// Pure helpers for reminder times, shared by the server and the EC AI screen.
// Times are "HH:MM" in the member's own time zone. Nothing is sent between 00:00 and 06:00.

export const EARLIEST = "06:00";
export const LATEST = "23:59";
export const MAX_TIMES = 12;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTime = (v: unknown): v is string => typeof v === "string" && TIME_RE.test(v) && v >= EARLIEST && v <= LATEST;

export const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMinutes = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Sorted, de-duplicated, valid times only, at most MAX_TIMES. */
export function normalizeTimes(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(isValidTime))].sort().slice(0, MAX_TIMES);
}

/** "Every 3 hours from 08:00 to 22:00" becomes ["08:00","11:00","14:00","17:00","20:00"]. */
export function timesEvery(hours: number, start: string, end: string): string[] {
  if (!(hours >= 1) || !isValidTime(start) || !isValidTime(end)) return [];
  const out: string[] = [];
  for (let m = toMinutes(start); m <= toMinutes(end) && out.length < MAX_TIMES; m += Math.round(hours * 60)) out.push(fromMinutes(m));
  return out;
}

/** Date ("YYYY-MM-DD") and minutes since midnight of an instant in a time zone. */
export function localParts(now: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return localParts(now, "Asia/Kolkata"); // an unknown zone name falls back to the app default
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * The slots that should go out now: a time counts as due from its minute until `graceMinutes` later, so a late ping still sends it
 * but a missed slot is never sent hours afterwards. Already-sent slots are filtered by the caller through the log.
 */
export function dueTimes(times: string[], minutes: number, graceMinutes = 20): string[] {
  return times.filter((t) => minutes >= toMinutes(t) && minutes < toMinutes(t) + graceMinutes);
}
