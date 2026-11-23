"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearPending, readPending, writePending } from "@/lib/pending-edits";
import type { DayPatch } from "@/server/tracker/schema";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced, ordered autosave for one day. Patches made while a request is in flight are merged and
 * sent afterwards; a failed patch is kept and retried with the next change or an explicit retry.
 */
export function useDaySaver(userId: string, date: string, delayMs = 500) {
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
    writePending(userId, date, queue.current);
    setStatus(ok ? "saved" : "error");
    setMessage(ok ? null : text);
    if (ok && Object.keys(queue.current).length > 0) void flush();
  }, [userId, date]);

  const save = useCallback(
    (patch: DayPatch) => {
      queue.current = { ...queue.current, ...patch };
      writePending(userId, date, queue.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [userId, date, delayMs, flush],
  );

  // Edits left over from an earlier visit (offline, closed tab) go out first; and again whenever we're back online.
  useEffect(() => {
    clearPending(userId); // anything left behind by another account on this device
    const pending = readPending(userId, date);
    if (Object.keys(pending).length > 0) {
      queue.current = { ...pending, ...queue.current };
      void flush();
    }
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [userId, date, flush]);

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
      void flush(); // leaving the screen (tab change, back, link): send whatever is still waiting
    };
  }, [flush]);

  return { status, message, save, retry: flush };
}
