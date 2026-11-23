import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dueTimes, isValidTime, localParts, normalizeTimes } from "@/lib/ec-times";
import * as t from "@/server/db/schema";
import { can } from "@/server/rbac/can";
import { normalizeNumber } from "@/server/ec/phone";
import { reminderMessage } from "@/server/ec/messages";
import { sendViaMisa, type MisaMessage } from "@/server/ec/misa";
import { getGroupSettings, getMySettings, groupSettingsSchema, mySettingsSchema, pendingToday, runTick, saveGroupSettings, saveMySettings, sendTest } from "@/server/ec/service";
import { makeTestDb } from "./helpers/db";

describe("times", () => {
  it("keeps the last allowed time at 23:45, the last ping of the day", () => {
    expect(isValidTime("23:45")).toBe(true);
    expect(isValidTime("23:46")).toBe(false);
    expect(isValidTime("05:59")).toBe(false);
  });
  it("drops invalid, duplicate and night-time entries, sorted, capped at 4", () => {
    expect(normalizeTimes(["21:00", "09:00", "09:00", "03:00", "25:00", "nope"])).toEqual(["09:00", "21:00"]);
    expect(normalizeTimes(["06:00", "07:00", "08:00", "09:00", "10:00", "11:00"])).toHaveLength(4);
  });
  it("a slot is due from its minute for 20 minutes, never before, never hours later", () => {
    expect(dueTimes(["09:00"], 8 * 60 + 59)).toEqual([]);
    expect(dueTimes(["09:00"], 9 * 60)).toEqual(["09:00"]);
    expect(dueTimes(["09:00"], 9 * 60 + 19)).toEqual(["09:00"]);
    expect(dueTimes(["09:00"], 9 * 60 + 20)).toEqual([]);
  });
  it("reads the local date and minutes in a time zone", () => {
    expect(localParts(new Date("2026-11-23T03:30:00Z"), "Asia/Kolkata")).toEqual({ date: "2026-11-23", minutes: 9 * 60 });
    expect(localParts(new Date("2026-11-23T20:00:00Z"), "Asia/Kolkata").date).toBe("2026-11-24");
  });
});

describe("phone numbers and messages", () => {
  it("normalizes to digits with country code", () => {
    expect(normalizeNumber("+91 98765-43210")).toBe("919876543210");
    expect(normalizeNumber("9876543210")).toBe("919876543210");
    expect(normalizeNumber("0091 98765 43210")).toBe("919876543210");
    for (const bad of ["", "abc", "123", "+1234567890123456", null, 5]) expect(normalizeNumber(bad), String(bad)).toBeNull();
  });
  it("tags exactly the numbers given, each as @number in the text, and names those without a number", () => {
    const m = reminderMessage({ numbers: ["919000000001", "919000000002"], names: ["Ansh"], done: 0, total: 3 }, "group:2026-11-23T09:00");
    expect(m.mentions).toEqual(["919000000001", "919000000002"]);
    expect(m.text).toContain("@919000000001 @919000000002");
    expect(m.text).toContain("Nobody has");
    expect(m.text).toContain("Also waiting: Ansh.");
    const some = reminderMessage({ numbers: ["919000000002"], names: [], done: 2, total: 3 }, "k");
    expect(some.text.startsWith("2/3 done today")).toBe(true);
    expect(some.mentions).toEqual(["919000000002"]);
    expect(reminderMessage({ numbers: [], names: [], done: 0, total: 1 }, "k").mentions).toEqual([]);
    expect(reminderMessage({ numbers: ["9"], names: [], done: 1, total: 2 }, "k")).toEqual(reminderMessage({ numbers: ["9"], names: [], done: 1, total: 2 }, "k")); // same slot, same text
  });
});

describe("validation and permissions", () => {
  it("my settings reject foreign fields and bad numbers", () => {
    expect(mySettingsSchema.safeParse({ role: "OWNER" }).success).toBe(false);
    expect(mySettingsSchema.safeParse({ userId: "x" }).success).toBe(false);
    expect(mySettingsSchema.safeParse({ whatsappNumber: "12" }).success).toBe(false);
    expect(mySettingsSchema.safeParse({ whatsappNumber: "" }).data).toEqual({ whatsappNumber: null });
    expect(mySettingsSchema.safeParse({ times: ["09:00"] }).success).toBe(false); // personal schedules are gone
  });
  it("the group reminder takes 1 to 4 valid times, sorted", () => {
    expect(groupSettingsSchema.safeParse({ times: ["03:00"] }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ times: ["23:50"] }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ times: [] }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ times: ["09:00", "10:00", "11:00", "12:00", "13:00"] }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ time: "21:30" }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ times: ["21:30", "09:00"], enabled: true }).data).toEqual({ times: ["09:00", "21:30"], enabled: true });
  });
  it("only the member edits their reminders; the owner reads them; other members see nothing", () => {
    const me = { id: "a", role: "MEMBER" as const }, other = { id: "b", role: "MEMBER" as const }, owner = { id: "o", role: "OWNER" as const };
    const r = { kind: "ec_reminder" as const, ownerId: "a" };
    expect(can(me, "read", r) && can(me, "write", r)).toBe(true);
    expect(can(owner, "read", r)).toBe(true);
    expect(can(owner, "write", r)).toBe(false);
    expect(can(other, "read", r) || can(other, "write", r)).toBe(false);
  });
  it("only the owner changes the group reminder", () => {
    const g = { kind: "ec_group" as const };
    expect(can({ id: "o", role: "OWNER" }, "admin", g)).toBe(true);
    expect(can({ id: "a", role: "MEMBER" }, "admin", g)).toBe(false);
    expect(can({ id: "a", role: "MEMBER" }, "read", g)).toBe(true);
    expect(can({ id: "a", role: "MEMBER" }, "write", g)).toBe(false);
  });
});

describe("Misa client", () => {
  it("posts to /ec/send with the secret, and fails loudly", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    await sendViaMisa({ text: "hi", mentions: [] }, "k1", { MISA_URL: "https://misa.example/", MISA_SECRET: "s" }, ok);
    expect(calls[0].url).toBe("https://misa.example/ec/send");
    expect((calls[0].init.headers as Record<string, string>)["x-cron-secret"]).toBe("s");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ text: "hi", mentions: [], key: "k1" });
    await expect(sendViaMisa({ text: "x", mentions: [] }, "k", {}, ok)).rejects.toThrow(/not configured/);
    const bad = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(sendViaMisa({ text: "x", mentions: [] }, "k", { MISA_URL: "https://m", MISA_SECRET: "s" }, bad)).rejects.toThrow(/500/);
  });
});

describe("tick", () => {
  let ctx: Awaited<ReturnType<typeof makeTestDb>>;
  let vaibhav: string, ansh: string, owner: string, ravi: string;
  const sent: { msg: MisaMessage; key: string }[] = [];
  const send = async (msg: MisaMessage, key: string) => void sent.push({ msg, key });
  const at = (hhmmIst: string) => new Date(`2026-11-23T${hhmmIst}:00+05:30`);
  const db = () => ctx.db;
  const logDay = async (userId: string, programmeId: string, completed: boolean) => {
    await db().insert(t.dailyLogs).values({ userId, commitmentId: programmeId, logDate: "2026-11-23", dayNumber: 3, isSunday: false, completed });
  };
  const programmes: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await makeTestDb();
    const rows = await ctx.db.insert(t.users).values([
      { email: "o@e.test", name: "Owner", role: "OWNER" },
      { email: "v@e.test", name: "Vaibhav" },
      { email: "a@e.test", name: "Ansh" },
      { email: "r@e.test", name: "Ravi" },
    ]).returning({ id: t.users.id });
    [owner, vaibhav, ansh, ravi] = rows.map((r) => r.id);
    const cs = await ctx.db.insert(t.commitments).values([vaibhav, ansh].map((userId) => ({ userId, startDate: "2026-11-21" }))).returning({ id: t.commitments.id, userId: t.commitments.userId });
    for (const c of cs) programmes[c.userId] = c.id;
    // The owner and Ravi have no 75 Hard running, so they are never tagged or counted.
    await saveMySettings(db(), vaibhav, { whatsappNumber: "919000000001", enabled: true });
    await saveMySettings(db(), ansh, { whatsappNumber: "919000000002", enabled: true });
    await saveMySettings(db(), ravi, { whatsappNumber: "919000000003", enabled: true });
  });
  afterAll(() => ctx.close());

  it("does nothing while the group reminder is off", async () => {
    expect(await runTick(db(), at("21:00"), send)).toEqual({ group: "off", sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("switching on tagging needs only a number", async () => {
    expect((await saveMySettings(db(), owner, { enabled: true })).enabled).toBe(false);
    expect(await getMySettings(db(), vaibhav)).toEqual({ whatsappNumber: "919000000001", enabled: true });
  });

  it("saves 1 to 4 times for the group reminder", async () => {
    expect(await getGroupSettings(db())).toMatchObject({ enabled: false, times: ["21:00"] });
    expect((await saveGroupSettings(db(), groupSettingsSchema.parse({ enabled: true, times: ["21:00", "09:00", "15:00"] }))).times).toEqual(["09:00", "15:00", "21:00"]);
  });

  it("nobody done: tags everyone whose day is running, once per slot", async () => {
    sent.length = 0;
    expect(await runTick(db(), at("08:59"), send)).toMatchObject({ group: "not_due", sent: 0 });
    const r = await runTick(db(), at("09:02"), send);
    expect(r).toMatchObject({ group: "sent", sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect([...sent[0].msg.mentions].sort()).toEqual(["919000000001", "919000000002"]);
    expect(sent[0].msg.text).toContain("Nobody has");
    expect(sent[0].key).toBe("group:2026-11-23T09:00");
    expect((await runTick(db(), at("09:07"), send)).group).toBe("done"); // same slot, no duplicate
    expect(sent).toHaveLength(1);
    expect((await getGroupSettings(db())).lastSentAt).not.toBeNull();
  });

  it("someone done: tags only the ones still to finish", async () => {
    sent.length = 0;
    await logDay(vaibhav, programmes[vaibhav], true);
    await runTick(db(), at("15:01"), send);
    expect(sent).toHaveLength(1);
    expect(sent[0].msg.mentions).toEqual(["919000000002"]);
    expect(sent[0].msg.text).toContain("1/2 done today");
    expect(sent[0].msg.text).not.toContain("919000000001");
  });

  it("an unfinished (saved but not complete) day still counts as pending", async () => {
    await logDay(ansh, programmes[ansh], false);
    expect(await pendingToday(db(), at("16:00"))).toMatchObject({ numbers: ["919000000002"], done: 1, total: 2 });
  });

  it("everyone done: sends nothing", async () => {
    sent.length = 0;
    await db().update(t.dailyLogs).set({ completed: true });
    await saveGroupSettings(db(), { times: ["21:00"] });
    expect(await runTick(db(), at("21:01"), send)).toEqual({ group: "all_done", sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("members who opted out are not tagged; those without a number are named", async () => {
    await db().update(t.dailyLogs).set({ completed: false });
    await saveMySettings(db(), ansh, { enabled: false });
    await saveMySettings(db(), vaibhav, { whatsappNumber: null, enabled: false });
    const p = await pendingToday(db(), at("21:05"));
    expect(p).toMatchObject({ numbers: [], names: ["Vaibhav"], done: 0, total: 2 });
  });

  it("two ticks at the same moment send once", async () => {
    sent.length = 0;
    await saveMySettings(db(), ansh, { enabled: true });
    await saveGroupSettings(db(), { times: ["19:00"] });
    await Promise.all([runTick(db(), at("19:00"), send), runTick(db(), at("19:00"), send)]);
    expect(sent).toHaveLength(1);
  });

  it("a missed slot is not sent hours later", async () => {
    sent.length = 0;
    await saveGroupSettings(db(), { times: ["12:00"] });
    expect((await runTick(db(), at("20:30"), send)).group).toBe("not_due");
    expect(sent).toHaveLength(0);
  });

  it("a failed send is retried inside the window, then sent exactly once", async () => {
    sent.length = 0;
    await saveGroupSettings(db(), { times: ["16:00"] });
    let fail = true;
    const flaky = async (msg: MisaMessage, key: string) => { if (fail) throw new Error("Misa answered 503"); sent.push({ msg, key }); };
    expect(await runTick(db(), at("16:01"), flaky)).toMatchObject({ group: "failed", sent: 0, failed: 1 });
    fail = false;
    expect(await runTick(db(), at("16:06"), flaky)).toMatchObject({ group: "sent", sent: 1, failed: 0 });
    expect(await runTick(db(), at("16:11"), flaky)).toMatchObject({ group: "done", sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("a test message tags only the requester", async () => {
    sent.length = 0;
    expect(await sendTest(db(), ansh, send)).toBe("sent");
    expect(sent[0].msg.mentions).toEqual(["919000000002"]);
    expect(await sendTest(db(), owner, send)).toBe("no_number");
  });
});
