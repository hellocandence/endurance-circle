import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).nullable();

/**
 * What a client may send for one day. `.strict()` rejects everything else, so a client can never set
 * server-computed fields (completed, dayNumber, isSunday, missedTasks) or someone else's userId.
 * All fields are optional: a request updates only the fields it names.
 */
export const dayPatchSchema = z
  .object({
    runKm: z.number().min(0).max(100),
    warmupPreDone: z.boolean(),
    warmupPostDone: z.boolean(),
    stretchMin: z.number().int().min(0).max(300),
    waterL: z.number().min(0).max(20),
    electrolytesDone: z.boolean(),
    proteinG: z.number().int().min(0).max(1000),
    studyMin: z.number().int().min(0).max(600),
    studyTopic: text(200),
    techNote: text(1000),
    githubContribution: z.boolean(),
    readingMin: z.number().int().min(0).max(600),
    readingTitle: text(200),
    updateText: text(280), // PUBLIC: shown to the whole circle
    privateNotes: text(2000), // PRIVATE: owner and member only
  })
  .partial()
  .strict();

export type DayPatch = z.infer<typeof dayPatchSchema>;
