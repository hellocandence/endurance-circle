"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormMessage } from "@/components/auth/fields";
import { TextField } from "@/components/today/controls";
import { GlassButton } from "@/components/ui";
import { patchJson } from "@/lib/api";
import type { ProfileView } from "@/server/profile/service";
import { Section, type Status } from "./Section";
import { TimeZoneSelect } from "./TimeZoneSelect";

export function ProfileForm({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const res = await patchJson<{ issues?: { message: string }[] }>("/api/profile", { name, timeZone, bio: bio.trim() === "" ? null : bio });
    if (res.ok) {
      setStatus({ kind: "ok", text: "Profile saved." });
      router.refresh();
    } else if (res.status === 400) {
      setStatus({ kind: "error", text: res.data.issues?.[0]?.message ?? "Please check your details." });
    } else {
      setStatus({ kind: "error", text: "Couldn't save. Please try again." });
    }
  }

  return (
    <Section title="Profile" description="Your name and bio are shown to the circle.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
        <div className="flex flex-col gap-1.5">
          <TimeZoneSelect value={timeZone} onChange={setTimeZone} />
          <button
            type="button"
            onClick={() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
            className="glass-focus self-start rounded-full px-3 py-1 text-sm font-medium text-accent-strong hover:underline"
          >
            Use this device&apos;s time zone
          </button>
        </div>
        <TextField label="Bio" value={bio} onChange={setBio} max={280} multiline />
        <p className="text-sm text-ink-muted">Signed in as {profile.email}{profile.role === "OWNER" ? " (owner)" : ""}.</p>
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">
          {status.kind === "saving" ? "Saving…" : "Save profile"}
        </GlassButton>
      </form>
    </Section>
  );
}
