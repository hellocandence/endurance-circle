// Pure helpers for reminder times, shared by the server and the EC AI screen.
// Times are "HH:MM" in the owner's time zone. Nothing is sent between 00:00 and 06:00. The last ping of the day
// is 23:45, so 23:45 is the latest time that can still be picked up.

export const EARLIEST = "06:00";
export const LATEST = "23:45";
export const MAX_TIMES = 4;

/** Starting times when the owner changes how many reminders a day there should be. */
export const DEFAULT_TIMES: Record<number, string[]> = {
  1: ["21:00"],
  2: ["12:00", "21:00"],
  3: ["09:00", "15:00", "21:00"],
  4: ["09:00", "13:00", "17:00", "21:00"],
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTime = (v: unknown): v is string => typeof v === "string" && TIME_RE.test(v) && v >= EARLIEST && v <= LATEST;

export const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Sorted, de-duplicated, valid times only, at most MAX_TIMES. */
export function normalizeTimes(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(isValidTime))].sort().slice(0, MAX_TIMES);
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
