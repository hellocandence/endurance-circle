import { Section } from "@/components/settings/Section";
import type { MemberOverview } from "@/server/ec/service";

/** Owner only: who has reminders on. Shows no phone numbers. */
export function EcOverview({ members }: { members: MemberOverview[] }) {
  return (
    <Section title="Circle reminders" description="Who has personal reminders on. Numbers stay private.">
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{m.name}</span>
            <span className="text-ink-muted">
              {m.enabled && m.hasNumber ? `On · ${m.times.length} a day` : m.hasNumber ? "Off" : "No number yet"}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
