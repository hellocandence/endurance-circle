import { OfflineActions } from "@/components/OfflineActions";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = { title: "Offline · Cadence" };

// Precached by the service worker, so it can be shown with no network at all. Contains no member data.
export default function OfflinePage() {
  return (
    <AuthShell title="You're offline" subtitle="Cadence needs a connection to load your circle. Your latest changes are saved on the server.">
      <OfflineActions />
    </AuthShell>
  );
}
