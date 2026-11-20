import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeNext } from "@/lib/safe-next";
import { auth } from "@/server/auth";
import { googleEnabled } from "@/server/auth/google-enabled";

export const metadata = { title: "Sign in · Cadence" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await auth()) redirect(safeNext(next));
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your circle.">
      <LoginForm next={next} authError={error} googleEnabled={googleEnabled()} />
    </AuthShell>
  );
}
