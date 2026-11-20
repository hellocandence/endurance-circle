import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = { title: "Join · Cadence" };

export default function SignUpPage() {
  return (
    <AuthShell title="Cadence is invite-only" subtitle="Ask the circle's owner for your personal invite link.">
      <Link href="/login" className="glass-focus rounded-full text-center font-medium text-accent-strong hover:underline">
        Already a member? Sign in
      </Link>
    </AuthShell>
  );
}
