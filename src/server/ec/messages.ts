// Fixed message templates (no AI). A slot always picks the same line, so a retry never changes the text.
const personal = [
  "time to update today's log. Two minutes now keeps your streak alive 💪",
  "quick check-in: have you ticked off today's tasks yet?",
  "your Endurance Circle day is still open. Log what you've done so far 🔥",
  "small nudge: update your progress while it's fresh.",
];
const group = [
  "Daily check-in ⏰ Everyone, please update today's log in Endurance Circle.",
  "Reminder 🔔 Take two minutes to log today's tasks and progress.",
  "Evening nudge 💪 Update your progress so the circle stays in sync.",
];

const pick = <T,>(list: T[], seed: string): T => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
};

/** Tags exactly one person: the text carries "@<number>" and the same number goes in `mentions`. */
export function personalMessage(number: string, slot: string): { text: string; mentions: string[] } {
  return { text: `@${number} ${pick(personal, slot)}`, mentions: [number] };
}

export function groupMessage(slot: string): { text: string; mentions: string[] } {
  return { text: pick(group, slot), mentions: [] };
}

export const testMessage = (number: string) => ({ text: `@${number} ✅ Endurance Circle test: reminders will reach you here.`, mentions: [number] });
