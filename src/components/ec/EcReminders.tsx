"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormMessage } from "@/components/auth/fields";
import { Chip, Toggle } from "@/components/today/controls";
import { GlassButton, useToast } from "@/components/ui";
import { postJson, sendJson } from "@/lib/api";
import { EARLIEST, LATEST, MAX_TIMES, normalizeTimes, timesEvery } from "@/lib/ec-times";
import type { MySettings } from "@/server/ec/service";
import { Section, type Status } from "@/components/settings/Section";

const select = "glass glass-focus min-h-12 w-full min-w-0 rounded-2xl px-3 text-base text-ink";

export function EcReminders({ mine, timeZone }: { mine: MySettings; timeZone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [number, setNumber] = useState(mine.whatsappNumber ?? "");
  const [enabled, setEnabled] = useState(mine.enabled);
  const [times, setTimes] = useState<string[]>(mine.times);
  const [hours, setHours] = useState("3");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("22:00");
  const [extra, setExtra] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const addTime = () => {
    if (extra) setTimes((t) => normalizeTimes([...t, extra]));
    setExtra("");
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const res = await sendJson<{ issues?: { message: string }[]; enabled?: boolean }>("PUT", "/api/ec/me", { whatsappNumber: number, enabled, times });
    if (res.ok) {
      setEnabled(res.data.enabled ?? false);
      const text = enabled && !res.data.enabled ? "Saved, but reminders stay off until you add a number and at least one time." : "Saved.";
      setStatus({ kind: "ok", text });
      toast(text.startsWith("Saved,") ? "Saved. Add a number and a time to switch reminders on." : "Reminders saved", text.startsWith("Saved,") ? "info" : "success");
      router.refresh();
    } else {
      const text = res.status === 400 ? (res.data.issues?.[0]?.message ?? "Please check your details.") : "Couldn't save. Please try again.";
      setStatus({ kind: "error", text });
      toast(text, "error");
    }
  }

  async function sendTest() {
    setStatus({ kind: "saving" });
    const res = await postJson<{ error?: string }>("/api/ec/test", {});
    const text = res.ok
      ? "Test sent. Check the WhatsApp group: it should tag you."
      : res.data.error === "no_number"
        ? "Save your WhatsApp number first."
        : res.status === 429
          ? "That's enough tests for now. Try again in a few minutes."
          : "The bot couldn't send it. Try again in a minute.";
    setStatus(res.ok ? { kind: "ok", text } : { kind: "error", text });
    toast(res.ok ? "Test message sent" : text, res.ok ? "success" : "error");
  }

  return (
    <Section title="Your reminders" description={`Personal nudges in the WhatsApp group that tag only you. Times are in your time zone (${timeZone}), between ${EARLIEST} and ${LATEST}. The app sleeps from 11:59 PM to 6:00 AM, so nothing is sent then. Reminders can arrive up to 15 minutes after the time you pick.`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Your WhatsApp number" type="tel" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={24} placeholder="919876543210" hint="With country code. Needed so the bot can tag you. Only you and the owner can see it." autoComplete="tel" />

        <fieldset className="flex flex-col gap-3 rounded-2xl bg-white/40 p-3">
          <legend className="px-1 text-sm font-medium">Quick setup</legend>
          <label className="flex flex-col gap-1 text-sm">Repeat every
            <select className={select} value={hours} onChange={(e) => setHours(e.target.value)}>
              {["1", "2", "3", "4", "6"].map((h) => <option key={h} value={h}>{h} hour{h === "1" ? "" : "s"}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm">From
              <input type="time" className={select} value={from} min={EARLIEST} max={LATEST} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">Until
              <input type="time" className={select} value={to} min={EARLIEST} max={LATEST} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <GlassButton type="button" onClick={() => setTimes(timesEvery(Number(hours), from, to))} className="w-full">Fill the times</GlassButton>
        </fieldset>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Reminder times ({times.length}/{MAX_TIMES})</p>
          {times.length === 0 ? <p className="text-sm text-ink-muted">None yet.</p> : (
            <ul className="flex flex-wrap gap-2">
              {times.map((t) => (
                <li key={t}><Chip onClick={() => setTimes(times.filter((x) => x !== t))}><span aria-hidden="true">{t} ✕</span><span className="sr-only">Remove {t}</span></Chip></li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 rounded-2xl bg-white/40 p-3">
            <label htmlFor="ec-add-time" className="text-sm font-medium">Add a time</label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input id="ec-add-time" type="time" className={select} value={extra} min={EARLIEST} max={LATEST} onChange={(e) => setExtra(e.target.value)} />
              <GlassButton type="button" onClick={addTime} disabled={!extra || times.length >= MAX_TIMES} className="min-h-12 px-6">Add</GlassButton>
            </div>
          </div>
        </div>

        <Toggle label="Send me reminders" checked={enabled} onChange={setEnabled} onText="On" offText="Off" />
        {mine.lastSentAt && <p className="text-sm text-ink-muted">Last reminder sent {new Date(mine.lastSentAt).toLocaleString()}.</p>}
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">{status.kind === "saving" ? "Working…" : "Save reminders"}</GlassButton>
        <button type="button" onClick={sendTest} disabled={status.kind === "saving"} className="glass-focus self-center rounded-full px-3 py-1 text-sm font-medium text-accent-strong hover:underline">Send me a test message</button>
      </form>
    </Section>
  );
}
