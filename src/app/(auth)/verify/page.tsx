import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmail } from "@/components/auth/VerifyEmail";

export const metadata = { title: "Verify email · Endurance Circle" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Verify your email">
      <VerifyEmail token={token} />
    </AuthShell>
  );
}
