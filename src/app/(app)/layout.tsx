import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppTabBar } from "@/components/AppTabBar";
import { auth } from "@/server/auth";

// Every page in this group needs a signed-in member. (Data routes enforce permissions again on the server.)
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await auth())) redirect("/login");
  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-4 pb-32 pt-6 md:pb-10 md:pl-32">{children}</main>
      <AppTabBar />
    </>
  );
}
