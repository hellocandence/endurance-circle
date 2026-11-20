"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type TabItem = { key: string; href: string; label: string; icon: ReactNode };

type TabBarProps = {
  items: TabItem[];
  /** Overrides route matching, e.g. for previews. */
  activeKey?: string;
};

/** Bottom bar on phones, left sidebar from md up (PRD §8). */
export function TabBar({ items, activeKey }: TabBarProps) {
  const pathname = usePathname();
  const isActive = (item: TabItem) =>
    activeKey ? item.key === activeKey : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-3 z-40 rounded-full px-2 pb-[env(safe-area-inset-bottom)] md:inset-y-3 md:left-3 md:right-auto md:w-24 md:rounded-(--radius-glass) md:px-2 md:pb-0"
    >
      <ul className="flex items-center justify-around md:h-full md:flex-col md:justify-start md:gap-2 md:py-4">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.key} className="flex-1 md:w-full md:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="glass-focus relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-xs font-medium text-ink-muted aria-[current=page]:text-accent md:rounded-2xl"
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-1 -z-10 rounded-full bg-glass-strong shadow-glass-press md:rounded-2xl"
                    transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  />
                )}
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
