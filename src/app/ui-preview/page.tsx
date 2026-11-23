import {
  DashboardIcon,
  GlassButton,
  GlassCard,
  ProgressIcon,
  ProgressRing,
  SettingsIcon,
  TabBar,
  TodayIcon,
  type TabItem,
} from "@/components/ui";

const tabs: TabItem[] = [
  { key: "dashboard", href: "#dashboard", label: "Circle", icon: <DashboardIcon /> },
  { key: "today", href: "#today", label: "Today", icon: <TodayIcon /> },
  { key: "progress", href: "#progress", label: "Progress", icon: <ProgressIcon /> },
  { key: "settings", href: "#settings", label: "Settings", icon: <SettingsIcon /> },
];

export default function UiPreview() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-32 pt-8 md:pl-32">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">UI preview</h1>
        <p className="mt-1 text-ink-muted">Endurance Circle glass design system.</p>
      </header>

      <section aria-labelledby="cards" className="flex flex-col gap-3">
        <h2 id="cards" className="text-lg font-semibold">GlassCard</h2>
        <GlassCard>
          <p className="font-medium">Static card</p>
          <p className="text-ink-muted">Translucent white, 20 px blur, soft shadow.</p>
        </GlassCard>
        <GlassCard interactive tabIndex={0} role="button" className="glass-focus">
          <p className="font-medium">Interactive card</p>
          <p className="text-ink-muted">Springs down when pressed.</p>
        </GlassCard>
      </section>

      <section aria-labelledby="buttons" className="flex flex-col gap-3">
        <h2 id="buttons" className="text-lg font-semibold">GlassButton</h2>
        <div className="flex flex-wrap gap-3">
          <GlassButton>Primary</GlassButton>
          <GlassButton variant="secondary">Secondary</GlassButton>
          <GlassButton variant="ghost">Ghost</GlassButton>
          <GlassButton disabled>Disabled</GlassButton>
        </div>
      </section>

      <section aria-labelledby="rings" className="flex flex-col gap-3">
        <h2 id="rings" className="text-lg font-semibold">ProgressRing</h2>
        <GlassCard className="flex items-center justify-around">
          <ProgressRing value={0} label="Empty ring" />
          <ProgressRing value={75} label="Daily goal, 6 of 8 done">
            <span>6/8</span>
          </ProgressRing>
          <ProgressRing value={100} label="Complete ring" />
        </GlassCard>
      </section>

      <section aria-labelledby="tabbar" className="flex flex-col gap-3">
        <h2 id="tabbar" className="text-lg font-semibold">TabBar</h2>
        <p className="text-ink-muted">Fixed to the bottom on phones and the left edge from 768 px.</p>
      </section>

      <TabBar items={tabs} activeKey="today" />
    </main>
  );
}
