import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dueTimes, localParts, normalizeTimes, timesEvery } from "@/lib/ec-times";
import * as t from "@/server/db/schema";
import { can } from "@/server/rbac/can";
import { normalizeNumber } from "@/server/ec/phone";
import { groupMessage, personalMessage } from "@/server/ec/messages";
import { sendViaMisa, type MisaMessage } from "@/server/ec/misa";
import { getGroupSettings, getMySettings, groupSettingsSchema, mySettingsSchema, runTick, saveGroupSettings, saveMySettings, sendTest } from "@/server/ec/service";
import { makeTestDb } from "./helpers/db";

describe("times", () => {
  it("builds 'every N hours' lists and keeps them inside 06:00-23:59", () => {
    expect(timesEvery(3, "08:00", "22:00")).toEqual(["08:00", "11:00", "14:00", "17:00", "20:00"]);
    expect(timesEvery(2, "05:00", "10:00")).toEqual([]); // 05:00 is before the quiet window ends
  });
  it("drops invalid, duplicate and night-time entries, sorted, capped at 12", () => {
    expect(normalizeTimes(["21:00", "09:00", "09:00", "03:00", "25:00", "nope"])).toEqual(["09:00", "21:00"]);
    expect(normalizeTimes(Array.from({ length: 30 }, (_, i) => `${String(6 + (i % 18)).padStart(2, "0")}:${i < 18 ? "00" : "30"}`))).toHaveLength(12);
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
  it("a personal message tags exactly that one number; the group message tags nobody", () => {
    const m = personalMessage("919876543210", "user:x:2026-11-23T09:00");
    expect(m.mentions).toEqual(["919876543210"]);
    expect(m.text.startsWith("@919876543210 ")).toBe(true);
    expect(groupMessage("group:2026-11-23").mentions).toEqual([]);
    expect(personalMessage("919876543210", "k")).toEqual(personalMessage("919876543210", "k")); // same slot, same text
  });
});

describe("validation and permissions", () => {
  it("my settings reject foreign fields and bad numbers", () => {
    expect(mySettingsSchema.safeParse({ role: "OWNER" }).success).toBe(false);
    expect(mySettingsSchema.safeParse({ userId: "x" }).success).toBe(false);
    expect(mySettingsSchema.safeParse({ whatsappNumber: "12" }).success).toBe(false);
    expect(mySettingsSchema.safeParse({ whatsappNumber: "" }).data).toEqual({ whatsappNumber: null });
    expect(groupSettingsSchema.safeParse({ time: "03:00" }).success).toBe(false);
    expect(groupSettingsSchema.safeParse({ time: "21:30", enabled: true }).success).toBe(true);
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
  let vaibhav: string, ansh: string, owner: string;
  const sent: { msg: MisaMessage; key: string }[] = [];
  const send = async (msg: MisaMessage, key: string) => void sent.push({ msg, key });
  const at = (hhmmIst: string) => new Date(`2026-11-23T${hhmmIst}:00+05:30`);
  const db = () => ctx.db;

  beforeAll(async () => {
    ctx = await makeTestDb();
    const rows = await ctx.db.insert(t.users).values([
      { email: "o@e.test", name: "Owner", role: "OWNER" },
      { email: "v@e.test", name: "Vaibhav" },
      { email: "a@e.test", name: "Ansh" },
    ]).returning({ id: t.users.id });
    [owner, vaibhav, ansh] = rows.map((r) => r.id);
  });
  afterAll(() => ctx.close());

  it("does nothing while everything is off", async () => {
    expect(await runTick(db(), at("21:00"), send)).toEqual({ group: "off", sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("switching on needs a number and times", async () => {
    expect((await saveMySettings(db(), vaibhav, { enabled: true })).enabled).toBe(false);
    const s = await saveMySettings(db(), vaibhav, { whatsappNumber: "919000000001", times: ["09:00", "12:00", "15:00"], enabled: true });
    expect(s).toMatchObject({ whatsappNumber: "919000000001", enabled: true, times: ["09:00", "12:00", "15:00"] });
    await saveMySettings(db(), ansh, { whatsappNumber: "919000000002", times: ["12:00"], enabled: true });
  });

  it("sends each person only their own slot, tagging only them, once", async () => {
    sent.length = 0;
    expect(await runTick(db(), at("09:02"), send)).toMatchObject({ sent: 1, failed: 0 });
    expect(sent.map((s) => s.msg.mentions)).toEqual([["919000000001"]]);
    expect(await runTick(db(), at("09:07"), send)).toMatchObject({ sent: 0 }); // same slot, no duplicate
    expect(sent).toHaveLength(1);
    await runTick(db(), at("12:01"), send);
    expect(sent.map((s) => s.msg.mentions[0]).sort()).toEqual(["919000000001", "919000000001", "919000000002"].sort());
    expect((await getMySettings(db(), vaibhav)).lastSentAt).not.toBeNull();
  });

  it("two ticks at the same moment send once", async () => {
    sent.length = 0;
    await Promise.all([runTick(db(), at("15:00"), send), runTick(db(), at("15:00"), send)]);
    expect(sent).toHaveLength(1);
  });

  it("a missed slot is not sent hours later", async () => {
    sent.length = 0;
    await saveMySettings(db(), ansh, { times: ["12:00", "18:00"] });
    await runTick(db(), at("20:30"), send);
    expect(sent).toHaveLength(0);
  });

  it("sends the group reminder once a day at the owner's time, with no tags", async () => {
    sent.length = 0;
    expect((await saveGroupSettings(db(), { enabled: true, time: "21:00" })).time).toBe("21:00");
    expect((await runTick(db(), at("20:59"), send)).group).toBe("not_due");
    expect((await runTick(db(), at("21:01"), send)).group).toBe("sent");
    expect((await runTick(db(), at("21:06"), send)).group).toBe("done");
    expect(sent).toHaveLength(1);
    expect(sent[0].msg.mentions).toEqual([]);
    expect((await getGroupSettings(db())).lastSentAt).not.toBeNull();
    expect(owner).toBeTruthy();
  });

  it("a failed send is retried inside the window, then sent exactly once", async () => {
    sent.length = 0;
    await saveMySettings(db(), ansh, { times: ["16:00"] });
    let fail = true;
    const flaky = async (msg: MisaMessage, key: string) => { if (fail) throw new Error("Misa answered 503"); sent.push({ msg, key }); };
    expect(await runTick(db(), at("16:01"), flaky)).toMatchObject({ sent: 0, failed: 1 });
    fail = false;
    expect(await runTick(db(), at("16:06"), flaky)).toMatchObject({ sent: 1, failed: 0 });
    expect(await runTick(db(), at("16:11"), flaky)).toMatchObject({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("disabled members are skipped, and a test message tags only the requester", async () => {
    sent.length = 0;
    await saveMySettings(db(), ansh, { enabled: false, times: ["17:00"] });
    await runTick(db(), at("17:01"), send);
    expect(sent).toHaveLength(0);
    expect(await sendTest(db(), vaibhav, send)).toBe("sent");
    expect(sent[0].msg.mentions).toEqual(["919000000001"]);
    expect(await sendTest(db(), owner, send)).toBe("no_number");
  });
});
