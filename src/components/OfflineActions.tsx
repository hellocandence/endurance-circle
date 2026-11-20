"use client";

import { useEffect, useState } from "react";
import { GlassButton } from "@/components/ui";

export function OfflineActions() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      <p role="status" className="text-center text-sm text-ink-muted">
        {online ? "You're back online." : "No connection right now."}
      </p>
      <GlassButton onClick={() => (window.location.href = "/dashboard")} className="w-full">
        {online ? "Open Cadence" : "Try again"}
      </GlassButton>
    </>
  );
}
