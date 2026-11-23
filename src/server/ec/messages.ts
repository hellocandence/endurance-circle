// Fixed message templates (no AI). A slot always picks the same line, so a retry never changes the text.
const nobodyDone = [
  "Daily check-in ⏰ Nobody has completed today's tasks yet. Let's get moving!",
  "Reminder 🔔 Today's tasks are still open for everyone. Take a few minutes to log them.",
  "Heads up 💪 Nobody has finished today yet. Be the first one!",
];
const someDone = [
  "Almost there 🔥 Finish today's tasks and update your log.",
  "Small nudge ⏰ Your day is still open. Log what you've done.",
  "Keep the streak alive 💪 Today's tasks are waiting.",
];

const pick = <T,>(list: T[], seed: string): T => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
};

export type Pending = {
  numbers: string[]; // members to tag, digits with country code
  names: string[]; // pending members who have no number: named in the text, nobody is tagged for them
  done: number; // members who completed today
  total: number; // members whose day is running today
};

/**
 * Nobody done: tags everyone. Some done: tags only the members still to finish. Every number in `mentions` also
 * appears in the text as "@number", which is what Misa needs to render the tag.
 */
export function reminderMessage(p: Pending, slot: string): { text: string; mentions: string[] } {
  const tags = p.numbers.map((n) => `@${n}`).join(" ");
  const head = p.done === 0 ? pick(nobodyDone, slot) : `${p.done}/${p.total} done today ✅ ${pick(someDone, slot)}`;
  const waiting = p.names.length > 0 ? ` Also waiting: ${p.names.join(", ")}.` : "";
  return { text: `${head}${tags ? ` ${tags}` : ""}${waiting}`, mentions: [...p.numbers] };
}

export const testMessage = (number: string) => ({ text: `@${number} ✅ Endurance Circle test: reminders will reach you here.`, mentions: [number] });
