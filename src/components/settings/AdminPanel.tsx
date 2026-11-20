"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/fields";
import { GlassButton } from "@/components/ui";
import { sendJson } from "@/lib/api";
import { Section } from "./Section";

type Invite = { id: string; status: "pending" | "used" | "revoked" | "expired"; createdAt: string | Date; expiresAt: string | Date };
type Member = { id: string; name: string; email: string; role: "OWNER" | "MEMBER"; disabled: boolean; verified: boolean };

const day = (d: string | Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d));
const BADGE: Record<Invite["status"], string> = { pending: "bg-indigo-100 text-accent-strong", used: "bg-emerald-100 text-success", revoked: "bg-white/70 text-ink-muted", expired: "bg-amber-100 text-amber-900" };

export function AdminPanel({ invites, members, meId }: { invites: Invite[]; members: Member[]; meId: string }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setMessage(null);
    const res = await sendJson<{ url?: string }>("POST", "/api/admin/invites", {});
    setBusy(false);
    if (res.ok && res.data.url) {
      setLink(res.data.url);
      router.refresh();
    } else setMessage({ kind: "error", text: "Couldn't create an invite." });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ kind: "success", text: "Link copied." });
    } catch {
      setMessage({ kind: "error", text: "Couldn't copy. Select the link and copy it by hand." });
    }
  }

  async function revoke(id: string) {
    const res = await sendJson("DELETE", `/api/admin/invites/${id}`, undefined);
    setMessage(res.ok ? { kind: "success", text: "Invite revoked." } : { kind: "error", text: "That invite can't be revoked any more." });
    router.refresh();
  }

  async function remove(id: string, permanent: boolean) {
    const res = await sendJson("DELETE", `/api/admin/members/${id}${permanent ? "?permanent=true" : ""}`, undefined);
    setConfirm(null);
    setMessage(res.ok ? { kind: "success", text: permanent ? "Member and their data deleted." : "Member removed from the circle." } : { kind: "error", text: "Couldn't remove that member." });
    router.refresh();
  }

  return (
    <Section title="Circle admin" description="Only you, the owner, see this section.">
      <div className="flex flex-col gap-3">
        <GlassButton onClick={create} disabled={busy} className="w-full">{busy ? "Creating…" : "Create invite link"}</GlassButton>
        {link && (
          <div className="glass flex flex-col gap-2 rounded-2xl p-3" role="group" aria-label="New invite link">
            <p className="text-sm font-medium">Share this link once. It works for one person and expires in 7 days. You won&apos;t see it again.</p>
            <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} className="glass-focus min-h-11 w-full rounded-xl bg-white/70 px-3 text-sm" />
            <GlassButton variant="secondary" onClick={copy}>Copy link</GlassButton>
          </div>
        )}
      </div>

      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

      <div>
        <h3 className="mb-2 font-semibold">Invites</h3>
        {invites.length === 0 ? (
          <p className="text-sm text-ink-muted">No invites yet.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Invites">
            {invites.map((i) => (
              <li key={i.id} className="glass flex items-center justify-between gap-2 rounded-2xl px-3 py-2">
                <span className="text-sm">Sent {day(i.createdAt)} · expires {day(i.expiresAt)}</span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[i.status]}`}>{i.status}</span>
                  {i.status === "pending" && <GlassButton variant="ghost" onClick={() => revoke(i.id)} className="min-h-9 px-3 text-sm" aria-label={`Revoke invite sent ${day(i.createdAt)}`}>Revoke</GlassButton>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Members</h3>
        <ul className="flex flex-col gap-2" aria-label="Members">
          {members.map((m) => (
            <li key={m.id} className="glass flex flex-col gap-2 rounded-2xl px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}{m.id === meId && " (you)"}</span>
                  <span className="block truncate text-sm text-ink-muted">{m.email}</span>
                </span>
                <span className="text-xs font-medium text-ink-muted">{m.role === "OWNER" ? "Owner" : m.disabled ? "Removed" : m.verified ? "Member" : "Not verified"}</span>
              </div>
              {m.role !== "OWNER" && !m.disabled && (
                confirm === m.id ? (
                  <div className="flex flex-col gap-2" role="group" aria-label={`Remove ${m.name}`}>
                    <p className="text-sm font-medium">Remove {m.name}?</p>
                    <div className="flex flex-wrap gap-2">
                      <GlassButton onClick={() => remove(m.id, false)} className="min-h-10 px-4 text-sm">Remove from circle</GlassButton>
                      <GlassButton variant="secondary" onClick={() => remove(m.id, true)} className="min-h-10 px-4 text-sm">Remove and delete their data</GlassButton>
                      <GlassButton variant="ghost" onClick={() => setConfirm(null)} className="min-h-10 px-4 text-sm">Cancel</GlassButton>
                    </div>
                  </div>
                ) : (
                  <GlassButton variant="ghost" onClick={() => setConfirm(m.id)} className="min-h-9 self-start px-3 text-sm" aria-label={`Remove ${m.name}`}>Remove</GlassButton>
                )
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
