import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { commitments, dailyLogs, ecGroupSettings, ecReminderLog, ecReminderSettings, users } from "@/server/db/schema";
import { dueTimes, isValidTime, localParts, MAX_TIMES, normalizeTimes } from "@/lib/ec-times";
import { localDate } from "@/server/tracker/dates";
import { dayNumber } from "@/server/tracker/rules";
import { reminderMessage, testMessage, type Pending } from "./messages";
import { sendViaMisa, type MisaMessage } from "./misa";
import { normalizeNumber } from "./phone";

export type Sender = (msg: MisaMessage, key: string) => Promise<void>;

const number = z
  .string()
  .trim()
  .max(24)
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = normalizeNumber(v);
    if (!n) ctx.addIssue({ code: "custom", message: "Enter the WhatsApp number with the country code, e.g. 919876543210" });
    return n;
  })
  .nullable();

/** `.strict()` so nothing but these fields can ever be written. `enabled` means "tag me in the group reminders". */
export const mySettingsSchema = z
  .object({
    whatsappNumber: number,
    enabled: z.boolean(),
  })
  .partial()
  .strict();

export const groupSettingsSchema = z
  .object({
    enabled: z.boolean(),
    times: z
      .array(z.string())
      .min(1, "Pick at least one time")
      .max(MAX_TIMES, `At most ${MAX_TIMES} reminders a day`)
      .refine((l) => l.every(isValidTime), "Pick times between 06:00 and 23:45")
      .transform(normalizeTimes)
      .refine((l) => l.length > 0, "Pick at least one time"),
  })
  .partial()
  .strict();

export type MySettings = { whatsappNumber: string | null; enabled: boolean };
export type GroupSettings = { enabled: boolean; times: string[]; lastSentAt: string | null };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function getMySettings(db: Db, userId: string): Promise<MySettings> {
  const [row] = await db.select().from(ecReminderSettings).where(eq(ecReminderSettings.userId, userId)).limit(1);
  return { whatsappNumber: row?.whatsappNumber ?? null, enabled: row?.enabled ?? false };
}

export async function saveMySettings(db: Db, userId: string, patch: z.infer<typeof mySettingsSchema>): Promise<MySettings> {
  const next = { ...patch };
  const current = await getMySettings(db, userId);
  const number = next.whatsappNumber !== undefined ? next.whatsappNumber : current.whatsappNumber;
  // Being tagged needs a number to tag.
  if (next.enabled === true && !number) next.enabled = false;
  const insert = db.insert(ecReminderSettings).values({ userId, ...next });
  if (Object.keys(next).length > 0) await insert.onConflictDoUpdate({ target: ecReminderSettings.userId, set: next });
  else await insert.onConflictDoNothing();
  return getMySettings(db, userId);
}

export async function getGroupSettings(db: Db): Promise<GroupSettings> {
  const [row] = await db.select().from(ecGroupSettings).where(eq(ecGroupSettings.id, 1)).limit(1);
  return { enabled: row?.enabled ?? false, times: row?.times ?? ["21:00"], lastSentAt: iso(row?.lastSentAt ?? null) };
}

export async function saveGroupSettings(db: Db, patch: z.infer<typeof groupSettingsSchema>): Promise<GroupSettings> {
  const insert = db.insert(ecGroupSettings).values({ id: 1, ...patch });
  if (Object.keys(patch).length > 0) await insert.onConflictDoUpdate({ target: ecGroupSettings.id, set: patch });
  else await insert.onConflictDoNothing();
  return getGroupSettings(db);
}

export type MemberOverview = { userId: string; name: string; enabled: boolean; hasNumber: boolean };

/** Owner view of who has reminders on. Never includes the numbers themselves. */
export async function listOverview(db: Db): Promise<MemberOverview[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, enabled: ecReminderSettings.enabled, number: ecReminderSettings.whatsappNumber })
    .from(users)
    .leftJoin(ecReminderSettings, eq(ecReminderSettings.userId, users.id))
    .where(eq(users.disabled, false))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ userId: r.userId, name: r.name, enabled: r.enabled ?? false, hasNumber: !!r.number }));
}

/** A one-off message to the member themselves, so they can check that tagging works. */
export async function sendTest(db: Db, userId: string, send: Sender = sendViaMisa): Promise<"sent" | "no_number"> {
  const { whatsappNumber } = await getMySettings(db, userId);
  if (!whatsappNumber) return "no_number";
  await send(testMessage(whatsappNumber), `test:${userId}:${Date.now()}`);
  return "sent";
}

/** Claim a slot. True when this caller should send it: new slot, or a failed one that is still inside its window. */
async function claim(db: Db, key: string, kind: "group" | "user", userId: string | null): Promise<boolean> {
  const inserted = await db.insert(ecReminderLog).values({ dedupeKey: key, kind, userId }).onConflictDoNothing().returning({ id: ecReminderLog.id });
  if (inserted.length > 0) return true;
  const retry = await db
    .update(ecReminderLog)
    .set({ status: "sending", error: null })
    .where(and(eq(ecReminderLog.dedupeKey, key), eq(ecReminderLog.status, "failed")))
    .returning({ id: ecReminderLog.id });
  return retry.length > 0;
}

async function deliver(db: Db, key: string, msg: MisaMessage, send: Sender): Promise<"sent" | "failed"> {
  try {
    await send(msg, key);
    await db.update(ecReminderLog).set({ status: "sent" }).where(eq(ecReminderLog.dedupeKey, key));
    return "sent";
  } catch (err) {
    await db.update(ecReminderLog).set({ status: "failed", error: (err as Error).message.slice(0, 200) }).where(eq(ecReminderLog.dedupeKey, key));
    return "failed";
  }
}

export type TickResult = { group: "off" | "not_due" | "sent" | "failed" | "done" | "all_done"; sent: number; failed: number };

/**
 * Who still has to finish today. A member counts while their 75 Hard is running today (in their own time zone) and
 * today's log is not completed. Those who opted in with a number are tagged; pending members without one are named.
 * Null when everyone running is done (or nobody is running), so nothing needs to be sent.
 */
export async function pendingToday(db: Db, now: Date): Promise<Pending | null> {
  const members = await db
    .select({ id: users.id, name: users.name, timeZone: users.timeZone, number: ecReminderSettings.whatsappNumber, optedIn: ecReminderSettings.enabled })
    .from(users)
    .leftJoin(ecReminderSettings, eq(ecReminderSettings.userId, users.id))
    .where(eq(users.disabled, false));
  if (members.length === 0) return null;

  const programmes = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.active, true), inArray(commitments.userId, members.map((m) => m.id))))
    .orderBy(desc(commitments.startDate));
  const latest = new Map<string, (typeof programmes)[number]>();
  for (const c of programmes) if (!latest.has(c.userId)) latest.set(c.userId, c);

  const running: { m: (typeof members)[number]; programmeId: string; today: string }[] = [];
  for (const m of members) {
    const c = latest.get(m.id);
    if (!c) continue;
    const today = localDate(now, m.timeZone);
    const day = dayNumber(c.startDate, today);
    if (day !== null && day <= c.totalDays) running.push({ m, programmeId: c.id, today });
  }
  if (running.length === 0) return null;

  const logs = await db
    .select({ userId: dailyLogs.userId, logDate: dailyLogs.logDate, completed: dailyLogs.completed })
    .from(dailyLogs)
    .where(and(inArray(dailyLogs.userId, running.map((r) => r.m.id)), inArray(dailyLogs.logDate, [...new Set(running.map((r) => r.today))])));
  const completed = new Set(logs.filter((l) => l.completed).map((l) => `${l.userId}:${l.logDate}`));

  const pending = running.filter((r) => !completed.has(`${r.m.id}:${r.today}`));
  if (pending.length === 0) return null;
  return {
    numbers: pending.filter((r) => r.m.optedIn && r.m.number).map((r) => r.m.number!),
    names: pending.filter((r) => !r.m.number).map((r) => r.m.name),
    done: running.length - pending.length,
    total: running.length,
  };
}

/**
 * Called every 15 minutes by an external ping. Sends whatever group reminder is due now and nothing twice: each slot is
 * claimed in ec_reminder_log first. A slot is due from its minute until 20 minutes later, so a missed ping never causes
 * a late burst. A slot where everyone has finished sends nothing.
 */
export async function runTick(db: Db, now: Date, send: Sender = sendViaMisa): Promise<TickResult> {
  const result: TickResult = { group: "off", sent: 0, failed: 0 };

  const group = await getGroupSettings(db);
  if (!group.enabled) return result;

  const [owner] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.role, "OWNER")).limit(1);
  const { date, minutes } = localParts(now, owner?.timeZone ?? "Asia/Kolkata");
  const due = dueTimes(group.times, minutes);
  if (due.length === 0) return { ...result, group: "not_due" };

  const outcomes = new Set<TickResult["group"]>();
  for (const t of due) {
    const pending = await pendingToday(db, now);
    if (!pending) {
      outcomes.add("all_done");
      continue;
    }
    const key = `group:${date}T${t}`;
    if (!(await claim(db, key, "group", null))) {
      outcomes.add("done");
      continue;
    }
    const outcome = await deliver(db, key, reminderMessage(pending, key), send);
    outcomes.add(outcome);
    if (outcome === "sent") {
      result.sent++;
      await db.update(ecGroupSettings).set({ lastSentAt: now }).where(eq(ecGroupSettings.id, 1));
    } else result.failed++;
  }
  result.group = (["failed", "sent", "done", "all_done"] as const).find((o) => outcomes.has(o)) ?? "done";
  return result;
}
