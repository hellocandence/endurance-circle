import Link from "next/link";
import { contactEmail } from "@/server/email/contact";

export const metadata = { title: "Terms · Endurance Circle" };

export default function TermsPage() {
  const email = contactEmail();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="text-neutral-600">Endurance Circle is a private app for a circle of friends. By using it you agree to the following.</p>

      <ul className="list-disc space-y-2 pl-5 text-neutral-700">
        <li>Access is by invitation from the owner only. Keep your sign-in details to yourself.</li>
        <li>Be kind. Do not post anything unlawful, abusive or that belongs to someone else.</li>
        <li>Endurance Circle is a habit tracker, not medical or fitness advice. Look after your own health and talk to a professional when you need to.</li>
        <li>The owner can remove an account or an entry at any time, and you can leave at any time.</li>
        <li>The app is provided as is, without any warranty. Things may change or stop working.</li>
      </ul>

      <p className="text-neutral-700">Questions? Ask the circle owner{email ? <> at <a className="text-accent-strong underline" href={`mailto:${email}`}>{email}</a></> : null}. See also the <Link href="/privacy" className="text-accent-strong underline">privacy page</Link>.</p>

      <Link href="/" className="text-accent-strong underline">Back to Endurance Circle</Link>
    </main>
  );
}
