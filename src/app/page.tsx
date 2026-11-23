import Link from "next/link";
import { auth } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signedIn = !!(await auth());
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Endurance Circle</h1>
      <p className="text-neutral-600">A private circle for building daily habits together.</p>
      <Link
        href={signedIn ? "/dashboard" : "/login"}
        className="glass-focus hover-lift inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 text-base font-medium text-white shadow-glass-press transition-colors duration-200 ease-out hover:bg-accent-strong"
      >
        {signedIn ? "Open Endurance Circle" : "Sign in"}
      </Link>
      {!signedIn && <p className="text-sm text-neutral-600">Invite only. Ask the owner for an invite.</p>}
    </main>
  );
}
