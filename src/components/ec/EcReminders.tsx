"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormMessage } from "@/components/auth/fields";
import { Chip, Toggle } from "@/components/today/controls";
import { GlassButton } from "@/components/ui";
import { postJson, sendJson } from "@/lib/api";
import { EARLIEST, LATEST, MAX_TIMES, normalizeTimes, timesEvery } from "@/lib/ec-times";
import type { MySettings } from "@/server/ec/service";
import { Section, type Status } from "@/components/settings/Section";

const select = "glass glass-focus min-h-12 w-full rounded-2xl px-4 text-base text-ink";

export function EcReminders({ mine, timeZone }: { mine: MySettings; timeZone: string }) {
  const router = useRouter();
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
      setStatus({ kind: "ok", text: enabled && !res.data.enabled ? "Saved, but reminders stay off until you add a number and at least one time." : "Saved." });
      router.refresh();
    } else setStatus({ kind: "error", text: res.status === 400 ? (res.data.issues?.[0]?.message ?? "Please check your details.") : "Couldn't save. Please try again." });
  }

  async function sendTest() {
    setStatus({ kind: "saving" });
    const res = await postJson<{ error?: string }>("/api/ec/test", {});
    if (res.ok) setStatus({ kind: "ok", text: "Test sent. Check the WhatsApp group: it should tag you." });
    else if (res.data.error === "no_number") setStatus({ kind: "error", text: "Save your WhatsApp number first." });
    else if (res.status === 429) setStatus({ kind: "error", text: "That's enough tests for now. Try again in a few minutes." });
    else setStatus({ kind: "error", text: "The bot couldn't send it. Try again in a minute." });
  }

  return (
    <Section title="Your reminders" description={`Personal nudges in the WhatsApp group that tag only you. Times are in your time zone (${timeZone}), between ${EARLIEST} and ${LATEST}. The app sleeps from 11:59 PM to 6:00 AM, so nothing is sent then. Reminders can arrive up to 15 minutes after the time you pick.`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Your WhatsApp number" type="tel" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={24} placeholder="919876543210" hint="With country code. Needed so the bot can tag you. Only you and the owner can see it." autoComplete="tel" />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Quick setup: repeat every</legend>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-sm">Every
              <select className={select} value={hours} onChange={(e) => setHours(e.target.value)}>
                {["1", "2", "3", "4", "6"].map((h) => <option key={h} value={h}>{h} hour{h === "1" ? "" : "s"}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">From
              <input type="time" className={select} value={from} min={EARLIEST} max={LATEST} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Until
              <input type="time" className={select} value={to} min={EARLIEST} max={LATEST} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <GlassButton type="button" onClick={() => setTimes(timesEvery(Number(hours), from, to))}>Fill the times</GlassButton>
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
          <div className="flex items-end gap-2">
            <div className="flex-1"><Field label="Add a time" type="time" value={extra} min={EARLIEST} max={LATEST} onChange={(e) => setExtra(e.target.value)} /></div>
            <GlassButton type="button" onClick={addTime} disabled={!extra || times.length >= MAX_TIMES} className="min-h-12">Add</GlassButton>
          </div>
        </div>

        <Toggle label="Send me reminders" checked={enabled} onChange={setEnabled} />
        {mine.lastSentAt && <p className="text-sm text-ink-muted">Last reminder sent {new Date(mine.lastSentAt).toLocaleString()}.</p>}
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">{status.kind === "saving" ? "Working…" : "Save reminders"}</GlassButton>
        <button type="button" onClick={sendTest} disabled={status.kind === "saving"} className="glass-focus self-center rounded-full px-3 py-1 text-sm font-medium text-accent-strong hover:underline">Send me a test message</button>
      </form>
    </Section>
  );
}
