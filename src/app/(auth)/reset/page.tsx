import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata = { title: "New password · Endurance Circle" };
// Keep reset tokens out of the Referer header sent to any third-party request.
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      <ResetForm token={token} />
    </AuthShell>
  );
}
