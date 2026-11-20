import { dailyLogs, users } from "@/server/db/schema";

/**
 * The ONLY daily_logs columns a public (circle-wide) query may select. `private_notes` and the free-text
 * fields a member may consider private are deliberately absent. Public feed queries select these
 * columns instead of the whole row, so a sensitive column cannot be fetched by accident.
 */
export const publicLogColumns = {
  userId: dailyLogs.userId,
  logDate: dailyLogs.logDate,
  dayNumber: dailyLogs.dayNumber,
  isSunday: dailyLogs.isSunday,
  completed: dailyLogs.completed,
  updateText: dailyLogs.updateText,
  doneCount: dailyLogs.doneCount,
  requiredCount: dailyLogs.requiredCount,
  doneTasks: dailyLogs.doneTasks, // task names only
} as const;

/** The only users columns a public query may select (never email, password hash, role flags, time zone). */
export const publicUserColumns = {
  id: users.id,
  name: users.name,
} as const;
