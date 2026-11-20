import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata = { title: "Forgot password · Cadence" };

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link.">
      <ForgotForm />
    </AuthShell>
  );
}
