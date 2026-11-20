"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

const inputClass =
  "glass glass-focus min-h-12 w-full rounded-2xl px-4 text-base text-ink placeholder:text-ink-muted disabled:opacity-60";

export function Field({ label, hint, id, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input id={inputId} aria-describedby={hint ? `${inputId}-hint` : undefined} className={inputClass} {...rest} />
      {hint && (
        <p id={`${inputId}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, hint, id, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={shown ? "text" : "password"}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          className={`${inputClass} pr-20`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="glass-focus absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-full px-3 text-sm font-medium text-accent-strong"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <p id={`${inputId}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-2xl px-4 py-3 text-sm font-medium ${
        kind === "error" ? "bg-red-50 text-danger" : "bg-emerald-50 text-success"
      }`}
    >
      {children}
    </p>
  );
}
