"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { FormMessage } from "./fields";

type State = "working" | "ok" | "bad";

export function VerifyEmail({ token }: { token?: string }) {
  const [state, setState] = useState<State>(token ? "working" : "bad");
  const started = useRef(false); // React strict mode runs effects twice in dev; the token works only once

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    postJson("/api/account/verify-email", { token }).then((res) => setState(res.ok ? "ok" : "bad"));
  }, [token]);

  return (
    <>
      {state === "working" && <p role="status" className="text-center text-ink-muted">Verifying your email…</p>}
      {state === "ok" && <FormMessage kind="success">Email verified. You can sign in now.</FormMessage>}
      {state === "bad" && (
        <FormMessage kind="error">This verification link is invalid or has expired. Sign in to request a new one.</FormMessage>
      )}
      {state !== "working" && (
        <Link href="/login" className="glass-focus rounded-full text-center font-medium text-accent-strong hover:underline">
          Go to sign in
        </Link>
      )}
    </>
  );
}
