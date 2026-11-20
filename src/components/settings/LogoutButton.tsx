"use client";

import { useState } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { clearPending } from "@/lib/pending-edits";

/** Signs out of this device only. A full page load afterwards drops everything held in memory. */
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setBusy(true);
    setFailed(false);
    const res = await postJson("/api/account/logout", {});
    if (res.ok) {
      clearPending(); // unsent offline edits belong to this sign-in
      window.location.assign("/login");
    } else {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2 pb-2">
      <GlassButton variant="secondary" onClick={logout} disabled={busy} className="w-full text-danger">
        {busy ? "Logging out…" : "Log out"}
      </GlassButton>
      {failed && <p role="alert" className="text-center text-sm text-danger">Couldn&apos;t log out. Please try again.</p>}
    </div>
  );
}
