"use client";

import { useEffect, useId, useState } from "react";

const input = "glass glass-focus min-h-12 w-full rounded-2xl px-4 text-base text-ink placeholder:text-ink-muted";

export function NumberField({
  label, value, onChange, unit, step = 1, max, hint,
}: { label: string; value: number; onChange: (n: number) => void; unit: string; step?: number; max: number; hint?: string }) {
  const id = useId();
  // An empty box with "0" as a placeholder, so typing 25 gives 25 (never 025). The text is kept locally so a
  // half-typed "2." is not rewritten under the cursor.
  const show = (n: number) => (Number.isFinite(n) && n !== 0 ? String(n) : "");
  const [text, setText] = useState(() => show(value));
  useEffect(() => {
    setText((t) => (Number(t || 0) === value ? t : show(value)));
  }, [value]);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          placeholder="0"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(Math.min(max, Math.max(0, e.target.valueAsNumber || 0)));
          }}
          className={input}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <span className="w-10 shrink-0 text-sm text-ink-muted">{unit}</span>
      </div>
      {hint && <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

export function TextField({ label, value, onChange, max, multiline = false, hint, placeholder }: { label: string; value: string; onChange: (s: string) => void; max: number; multiline?: boolean; hint?: string; placeholder?: string }) {
  const id = useId();
  const common = { id, value, maxLength: max, placeholder, className: input, "aria-describedby": hint ? `${id}-hint` : undefined };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} className={`${input} py-3`} />
      ) : (
        <input {...common} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

/** A big, thumb-friendly switch for yes/no tasks. */
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`glass-focus hover-lift flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-base font-medium transition-colors duration-200 ${checked ? "bg-emerald-700 text-white" : "glass text-ink"}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{checked ? "Done" : "Tap to mark"}</span>
    </button>
  );
}

export function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass glass-focus hover-lift min-h-10 rounded-full px-4 text-sm font-medium text-accent-strong">
      {children}
    </button>
  );
}
