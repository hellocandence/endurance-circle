"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DayPatch } from "@/server/tracker/schema";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced, ordered autosave for one day. Patches made while a request is in flight are merged and
 * sent afterwards; a failed patch is kept and retried with the next change or an explicit retry.
 */
export function useDaySaver(date: string, delayMs = 500) {
  const queue = useRef<DayPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current || Object.keys(queue.current).length === 0) return;

    const patch = queue.current;
    queue.current = {};
    inFlight.current = true;
    setStatus("saving");
    let ok = false;
    let text: string | null = null;
    try {
      const res = await fetch(`/api/tracker/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        keepalive: true,
      });
      ok = res.ok;
      if (!ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        text = body.error === "locked" ? "This day is locked and can no longer be edited." : "Couldn't save. Tap retry.";
        // invalid (400) or locked (409): retrying the same patch cannot succeed, so drop it; keep it otherwise
        if (res.status !== 400 && res.status !== 409) queue.current = { ...patch, ...queue.current };
      }
    } catch {
      queue.current = { ...patch, ...queue.current };
      text = "You're offline. Changes will save when you're back.";
    }
    inFlight.current = false;
    setStatus(ok ? "saved" : "error");
    setMessage(ok ? null : text);
    if (ok && Object.keys(queue.current).length > 0) void flush();
  }, [date]);

  const save = useCallback(
    (patch: DayPatch) => {
      queue.current = { ...queue.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  // Don't lose edits when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as () => void);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide as () => void);
    };
  }, [flush]);

  return { status, message, save, retry: flush };
}
