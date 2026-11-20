"use client";

import { DashboardIcon, ProgressIcon, SettingsIcon, TabBar, TodayIcon, type TabItem } from "@/components/ui";

const items: TabItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Circle", icon: <DashboardIcon /> },
  { key: "today", href: "/today", label: "Today", icon: <TodayIcon /> },
  { key: "progress", href: "/progress", label: "Progress", icon: <ProgressIcon /> },
  { key: "settings", href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export function AppTabBar() {
  return <TabBar items={items} />;
}
