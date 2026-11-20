// Dates are calendar dates ("YYYY-MM-DD") in the member's own time zone: the day boundary is local
// midnight (PRD F-04). Arithmetic is done in UTC on the date alone, so no DST or zone surprises.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isDateString = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && toIso(fromIso(s)) === s;

const fromIso = (d: string) => new Date(`${d}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** YYYY-MM-DD for `now` in the given IANA time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export const addDays = (d: string, n: number) => toIso(new Date(fromIso(d).getTime() + n * DAY_MS));
export const daysBetween = (from: string, to: string) => Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / DAY_MS);
export const isSunday = (d: string) => fromIso(d).getUTCDay() === 0;
