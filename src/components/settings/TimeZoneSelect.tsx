"use client";

import { useEffect, useId, useState } from "react";

const FALLBACK = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const pretty = (z: string) => z.split("/").slice(1).join(" / ").replace(/_/g, " ") || z;

/** A real dropdown of every IANA time zone, grouped by region; the current value is always one of the options. */
export function TimeZoneSelect({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const id = useId();
  const [zones, setZones] = useState<string[]>(FALLBACK);

  useEffect(() => {
    try {
      setZones(Intl.supportedValuesOf("timeZone"));
    } catch {
      /* older browsers: the short list above */
    }
  }, []);

  const all = zones.includes(value) ? zones : [value, ...zones];
  const groups = new Map<string, string[]>();
  for (const z of all) {
    const region = z.includes("/") ? z.split("/")[0] : "Other";
    groups.set(region, [...(groups.get(region) ?? []), z]);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">Time zone</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass glass-focus min-h-12 w-full rounded-2xl px-4 text-base text-ink"
      >
        {[...groups].map(([region, list]) => (
          <optgroup key={region} label={region}>
            {list.map((z) => <option key={z} value={z}>{pretty(z)}</option>)}
          </optgroup>
        ))}
      </select>
      <p className="text-sm text-ink-muted">Your day starts and ends at midnight in this zone.</p>
    </div>
  );
}
