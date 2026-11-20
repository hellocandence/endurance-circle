import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { googleEnabled } from "@/server/auth/google-enabled";
import { getUsableInvite } from "@/server/auth/invites";
import { getDb } from "@/server/db";

export const metadata = { title: "Join the circle · Cadence", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Read-only check: opening the link never consumes the invite (link previews are harmless).
  const invite = await getUsableInvite(getDb(), token);
  if (!invite) {
    return (
      <AuthShell title="Invite not valid" subtitle="This invite has expired, been used, or been revoked. Ask the owner for a new one.">
        <Link href="/login" className="glass-focus rounded-full text-center font-medium text-accent-strong hover:underline">
          Already a member? Sign in
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Join the circle" subtitle="You've been invited to Cadence.">
      <SignUpForm token={token} lockedEmail={invite.email} googleEnabled={googleEnabled()} />
    </AuthShell>
  );
}
