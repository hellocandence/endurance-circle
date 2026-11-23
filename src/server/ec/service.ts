import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { ecGroupSettings, ecReminderLog, ecReminderSettings, users } from "@/server/db/schema";
import { dueTimes, isValidTime, localParts, normalizeTimes } from "@/lib/ec-times";
import { groupMessage, personalMessage, testMessage } from "./messages";
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

/** `.strict()` so nothing but these fields can ever be written. */
export const mySettingsSchema = z
  .object({
    whatsappNumber: number,
    enabled: z.boolean(),
    times: z.array(z.string()).max(12).transform(normalizeTimes),
  })
  .partial()
  .strict();

export const groupSettingsSchema = z
  .object({ enabled: z.boolean(), time: z.string().refine(isValidTime, "Pick a time between 06:00 and 23:59") })
  .partial()
  .strict();

export type MySettings = { whatsappNumber: string | null; enabled: boolean; times: string[]; lastSentAt: string | null };
export type GroupSettings = { enabled: boolean; time: string; lastSentAt: string | null };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function getMySettings(db: Db, userId: string): Promise<MySettings> {
  const [row] = await db.select().from(ecReminderSettings).where(eq(ecReminderSettings.userId, userId)).limit(1);
  return { whatsappNumber: row?.whatsappNumber ?? null, enabled: row?.enabled ?? false, times: row?.times ?? [], lastSentAt: iso(row?.lastSentAt ?? null) };
}

export async function saveMySettings(db: Db, userId: string, patch: z.infer<typeof mySettingsSchema>): Promise<MySettings> {
  const next = { ...patch };
  const current = await getMySettings(db, userId);
  const number = next.whatsappNumber !== undefined ? next.whatsappNumber : current.whatsappNumber;
  const times = next.times ?? current.times;
  // Switching on needs somewhere to send to and something to send at.
  if (next.enabled === true && (!number || times.length === 0)) next.enabled = false;
  const insert = db.insert(ecReminderSettings).values({ userId, ...next });
  if (Object.keys(next).length > 0) await insert.onConflictDoUpdate({ target: ecReminderSettings.userId, set: next });
  else await insert.onConflictDoNothing();
  return getMySettings(db, userId);
}

export async function getGroupSettings(db: Db): Promise<GroupSettings> {
  const [row] = await db.select().from(ecGroupSettings).where(eq(ecGroupSettings.id, 1)).limit(1);
  return { enabled: row?.enabled ?? false, time: row?.time ?? "21:00", lastSentAt: iso(row?.lastSentAt ?? null) };
}

export async function saveGroupSettings(db: Db, patch: z.infer<typeof groupSettingsSchema>): Promise<GroupSettings> {
  const insert = db.insert(ecGroupSettings).values({ id: 1, ...patch });
  if (Object.keys(patch).length > 0) await insert.onConflictDoUpdate({ target: ecGroupSettings.id, set: patch });
  else await insert.onConflictDoNothing();
  return getGroupSettings(db);
}

export type MemberOverview = { userId: string; name: string; enabled: boolean; hasNumber: boolean; times: string[]; lastSentAt: string | null };

/** Owner view of who has reminders on. Never includes the numbers themselves. */
export async function listOverview(db: Db): Promise<MemberOverview[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, enabled: ecReminderSettings.enabled, number: ecReminderSettings.whatsappNumber, times: ecReminderSettings.times, lastSentAt: ecReminderSettings.lastSentAt })
    .from(users)
    .leftJoin(ecReminderSettings, eq(ecReminderSettings.userId, users.id))
    .where(eq(users.disabled, false))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ userId: r.userId, name: r.name, enabled: r.enabled ?? false, hasNumber: !!r.number, times: r.times ?? [], lastSentAt: iso(r.lastSentAt) }));
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

export type TickResult = { group: "off" | "not_due" | "sent" | "failed" | "done"; sent: number; failed: number };

/**
 * Called every few minutes by an external ping. Sends whatever is due now and nothing twice: each slot is claimed in
 * ec_reminder_log first. A slot is due from its minute until 20 minutes later, so a missed ping never causes a late burst.
 */
export async function runTick(db: Db, now: Date, send: Sender = sendViaMisa): Promise<TickResult> {
  const result: TickResult = { group: "off", sent: 0, failed: 0 };

  const group = await getGroupSettings(db);
  if (group.enabled) {
    const [owner] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.role, "OWNER")).limit(1);
    const { date, minutes } = localParts(now, owner?.timeZone ?? "Asia/Kolkata");
    if (dueTimes([group.time], minutes).length === 0) result.group = "not_due";
    else {
      const key = `group:${date}`;
      if (!(await claim(db, key, "group", null))) result.group = "done";
      else {
        result.group = await deliver(db, key, groupMessage(key), send);
        if (result.group === "sent") await db.update(ecGroupSettings).set({ lastSentAt: now }).where(eq(ecGroupSettings.id, 1));
      }
    }
  }

  const people = await db
    .select({ userId: ecReminderSettings.userId, number: ecReminderSettings.whatsappNumber, times: ecReminderSettings.times, timeZone: users.timeZone })
    .from(ecReminderSettings)
    .innerJoin(users, eq(users.id, ecReminderSettings.userId))
    .where(and(eq(ecReminderSettings.enabled, true), eq(users.disabled, false), sql`${ecReminderSettings.whatsappNumber} is not null`));

  for (const p of people) {
    const { date, minutes } = localParts(now, p.timeZone);
    for (const t of dueTimes(p.times, minutes)) {
      const key = `user:${p.userId}:${date}T${t}`;
      if (!(await claim(db, key, "user", p.userId))) continue;
      const outcome = await deliver(db, key, personalMessage(p.number!, key), send);
      if (outcome === "sent") {
        result.sent++;
        await db.update(ecReminderSettings).set({ lastSentAt: now }).where(eq(ecReminderSettings.userId, p.userId));
      } else result.failed++;
    }
  }
  return result;
}
