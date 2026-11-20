import { InstallGuide } from "@/components/install/InstallGuide";

export const metadata = { title: "Install Cadence" };

// Public on purpose: people read this before they have an account on their phone.
export default function InstallPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-strong">Cadence</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Add Cadence to your phone</h1>
        <p className="mt-2 text-ink-muted">It works like an app: full screen, on your home screen.</p>
      </header>
      <InstallGuide />
    </main>
  );
}
