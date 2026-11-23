"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "success" | "error" | "info";
type Item = { id: number; text: string; kind: Kind };
type Toast = (text: string, kind?: Kind) => void;

const Ctx = createContext<Toast>(() => {});

/** Pop-up messages ("Saved", "Couldn't send") that appear at the top and go away on their own. */
export const useToast = () => useContext(Ctx);

const tone: Record<Kind, string> = {
  success: "bg-emerald-700 text-white",
  error: "bg-rose-700 text-white",
  info: "bg-slate-800 text-white",
};
const icon: Record<Kind, string> = { success: "✓", error: "!", info: "i" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);

  const toast = useCallback<Toast>((text, kind = "info") => {
    const id = next.current++;
    setItems((list) => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  const value = useMemo(() => toast, [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4 pt-[env(safe-area-inset-top)]">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div
              key={i.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-glass ${tone[i.kind]}`}
            >
              <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-white/25 text-xs font-bold">{icon[i.kind]}</span>
              {i.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
