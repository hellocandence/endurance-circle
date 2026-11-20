"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DayPatch } from "@/server/tracker/schema";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Unsent edits survive a closed tab or a long time offline. Only the member's own pending changes are
// kept, and only until the server accepts them (the service worker still never caches API responses).
const pendingKey = (date: string) => `cadence:pending:${date}`;
const readPending = (date: string): DayPatch => {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(date)) ?? "{}") as DayPatch;
  } catch {
    return {};
  }
};
const writePending = (date: string, patch: DayPatch) => {
  try {
    if (Object.keys(patch).length === 0) localStorage.removeItem(pendingKey(date));
    else localStorage.setItem(pendingKey(date), JSON.stringify(patch));
  } catch {
    // storage unavailable (private mode): edits are still kept in memory
  }
};

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
    writePending(date, queue.current);
    setStatus(ok ? "saved" : "error");
    setMessage(ok ? null : text);
    if (ok && Object.keys(queue.current).length > 0) void flush();
  }, [date]);

  const save = useCallback(
    (patch: DayPatch) => {
      queue.current = { ...queue.current, ...patch };
      writePending(date, queue.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [date, delayMs, flush],
  );

  // Edits left over from an earlier visit (offline, closed tab) go out first; and again whenever we're back online.
  useEffect(() => {
    const pending = readPending(date);
    if (Object.keys(pending).length > 0) {
      queue.current = { ...pending, ...queue.current };
      void flush();
    }
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [date, flush]);

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
