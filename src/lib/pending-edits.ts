import type { DayPatch } from "@/server/tracker/schema";

// Unsent Today edits kept on the device until the server accepts them (see useDaySaver).
// Keys include the user id so one account's edits are never replayed into another's on a shared phone,
// and private notes are never written to storage (they stay in memory for the open tab only).
const PREFIX = "cadence:pending:";
const key = (userId: string, date: string) => `${PREFIX}${userId}:${date}`;
const withoutPrivate = (patch: DayPatch): DayPatch => {
  const rest = { ...patch };
  delete rest.privateNotes;
  return rest;
};

export function readPending(userId: string, date: string): DayPatch {
  try {
    return JSON.parse(localStorage.getItem(key(userId, date)) ?? "{}") as DayPatch;
  } catch {
    return {};
  }
}

export function writePending(userId: string, date: string, patch: DayPatch) {
  try {
    const safe = withoutPrivate(patch);
    if (Object.keys(safe).length === 0) localStorage.removeItem(key(userId, date));
    else localStorage.setItem(key(userId, date), JSON.stringify(safe));
  } catch {
    // storage unavailable (private mode): edits are still kept in memory
  }
}

/** Removes stored edits. With a user id, keeps that user's entries and drops everyone else's. */
export function clearPending(keepUserId?: string) {
  try {
    const keep = keepUserId ? `${PREFIX}${keepUserId}:` : null;
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX) && !(keep && k.startsWith(keep))) localStorage.removeItem(k);
    }
  } catch {
    // nothing to clear
  }
}
