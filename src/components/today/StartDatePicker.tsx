"use client";

import { useId, useState } from "react";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The upcoming Monday (never today: if today is Monday, the next one). */
export function nextMonday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return iso(d);
}

const label = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

type Choice = "today" | "monday" | "date";

/** Pick when the 75 days begin: today, next Monday, or any day within the next 60. Reports the date as YYYY-MM-DD. */
export function StartDatePicker({ onChange }: { onChange: (startDate: string | undefined) => void }) {
  const name = useId();
  const monday = nextMonday();
  const todayIso = iso(new Date());
  const max = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return iso(d); })();
  const [choice, setChoice] = useState<Choice>("today");
  const [custom, setCustom] = useState(monday);

  function pick(c: Choice, date = custom) {
    setChoice(c);
    onChange(c === "today" ? undefined : c === "monday" ? monday : date);
  }

  const options: { id: Choice; title: string; hint: string }[] = [
    { id: "today", title: "Today", hint: "Day 1 begins now" },
    { id: "monday", title: "Next Monday", hint: label(monday) },
    { id: "date", title: "Pick a date", hint: choice === "date" ? label(custom) : "Any day in the next 60" },
  ];
  return (
    <fieldset className="flex flex-col gap-2 text-left">
      <legend className="mb-1 text-sm font-medium">When should Day 1 be?</legend>
      {options.map((o) => (
        <label
          key={o.id}
          className={`glass-focus flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-2 transition-colors ${choice === o.id ? "bg-accent text-white" : "glass text-ink"}`}
        >
          <span className="flex items-center gap-3">
            <input type="radio" name={name} value={o.id} checked={choice === o.id} onChange={() => pick(o.id)} className="size-4 accent-white" />
            <span className="font-semibold">{o.title}</span>
          </span>
          <span className={`text-sm ${choice === o.id ? "text-white/85" : "text-ink-muted"}`}>{o.hint}</span>
        </label>
      ))}
      {choice === "date" && (
        <input
          type="date"
          aria-label="Start date"
          min={todayIso}
          max={max}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            if (e.target.value) pick("date", e.target.value);
          }}
          className="glass glass-focus min-h-12 w-full rounded-2xl px-4 text-base text-ink"
        />
      )}
    </fieldset>
  );
}
