import Link from "next/link";
import { contactEmail } from "@/server/email/contact";

export const metadata = { title: "Privacy · Cadence" };

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-neutral-600">Cadence is a private, invite-only app for a small circle of friends. This page says what it keeps and why.</p>

      <h2 className="mt-2 text-xl font-semibold">What we store</h2>
      <ul className="list-disc space-y-1 pl-5 text-neutral-700">
        <li>Your name, email address and profile (photo and bio, if you add them).</li>
        <li>Your daily habit entries and progress, shared with the circle as you choose in Settings.</li>
        <li>Body metrics, if you enter any. They are visible only to you and the owner of the circle, never in public views.</li>
        <li>If you sign in with Google, we receive your name, email address and whether Google has verified that address. Nothing else from your Google account.</li>
      </ul>

      <h2 className="mt-2 text-xl font-semibold">How we use it</h2>
      <ul className="list-disc space-y-1 pl-5 text-neutral-700">
        <li>To run your account and show your progress to the circle.</li>
        <li>To send account emails (invites, email verification, password resets). These are sent from a Gmail account owned by the circle owner using Google&apos;s Gmail API. We do not read any mailbox.</li>
        <li>We do not sell your data, show ads or share it with third parties, apart from the hosting services that run the app (Render for the app, Supabase for the database).</li>
      </ul>

      <h2 className="mt-2 text-xl font-semibold">Your choices</h2>
      <p className="text-neutral-700">You can edit your details in Settings. To delete your account and data, ask the owner{email ? <> at <a className="text-accent-strong underline" href={`mailto:${email}`}>{email}</a></> : null}.</p>

      <Link href="/" className="text-accent-strong underline">Back to Cadence</Link>
    </main>
  );
}
