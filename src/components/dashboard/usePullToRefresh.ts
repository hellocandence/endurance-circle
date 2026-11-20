"use client";

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 80;

/** Touch pull-down at the top of the page triggers `onRefresh`. Returns the current pull distance (0 to 1.5× threshold). */
export function usePullToRefresh(onRefresh: () => void) {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const latest = useRef(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
      latest.current = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const delta = Math.max(0, e.touches[0].clientY - start.current);
      latest.current = Math.min(delta, THRESHOLD * 1.5);
      setPull(latest.current);
    };
    const onEnd = () => {
      if (start.current !== null && latest.current >= THRESHOLD) cb.current();
      start.current = null;
      latest.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return { pull, ready: pull >= THRESHOLD };
}
