import { describe, expect, it } from "vitest";
import {
  addDays, completion, DEFAULT_CONFIG, dayNumber, daysBetween, evaluateDay, isDateString, isSunday, localDate,
  perfectDaysInARow, proteinTarget, reachedFinalDay, requiredTasks, taskStatus, type DayInput, type TrackerConfig,
} from "@/server/tracker";

const FRI = "2026-11-20";
const SUN = "2026-11-22";

const full: DayInput = {
  runKm: 5, warmupPreDone: true, warmupPostDone: true, stretchMin: 0, waterL: 3, electrolytesDone: true,
  proteinG: 84, studyMin: 60, techNote: "Use partial indexes", githubContribution: true, readingMin: 15,
};
const config: TrackerConfig = { ...DEFAULT_CONFIG, weightKg: 70 };
const eval_ = (input: Partial<DayInput>, date = FRI, dayOver = false) => evaluateDay({ ...full, ...input }, { date, dayOver, config });

describe("protein target", () => {
  it("1.2 × 70 kg = 84 g", () => expect(proteinTarget(70, 1.2)).toBe(84));
  it("rounds and honours the member's multiplier", () => {
    expect(proteinTarget(71.5, 1.2)).toBe(86);
    expect(proteinTarget(80, 1.6)).toBe(128);
  });
  it("is unknown without a valid weight", () => {
    for (const w of [null, 0, -5, NaN]) expect(proteinTarget(w)).toBeNull();
  });
});

describe("required tasks", () => {
  it("normal day: run, both warm-ups and the seven daily tasks", () => {
    expect(requiredTasks(false)).toEqual(["RUN", "WARM_PRE", "WARM_POST", "WATER", "ELECTRO", "PROTEIN", "STUDY", "TECH", "GITHUB", "SATSANG"]);
  });
  it("Sunday: stretch replaces run and warm-ups (BR5)", () => {
    const sun = requiredTasks(true);
    expect(sun).toContain("STRETCH");
    for (const k of ["RUN", "WARM_PRE", "WARM_POST"] as const) expect(sun).not.toContain(k);
    expect(sun).toHaveLength(8);
  });
});

describe("a normal day", () => {
  it("completes when every required task is done", () => {
    const r = eval_({});
    expect(r).toMatchObject({ completed: true, pending: [], missed: [], doneCount: 10, requiredCount: 10 });
  });

  it("stretching is optional on a normal day", () => {
    expect(eval_({ stretchMin: 0 }).completed).toBe(true);
  });

  it.each([
    ["RUN", { runKm: 4.99 }],
    ["WARM_PRE", { warmupPreDone: false }],
    ["WARM_POST", { warmupPostDone: false }],
    ["WATER", { waterL: 2.99 }],
    ["ELECTRO", { electrolytesDone: false }],
    ["PROTEIN", { proteinG: 83 }],
    ["STUDY", { studyMin: 59 }],
    ["TECH", { techNote: "   " }],
    ["GITHUB", { githubContribution: false }],
    ["SATSANG", { readingMin: 0 }],
  ] as const)("is incomplete when %s is not met", (key, patch) => {
    const r = eval_(patch);
    expect(r.completed).toBe(false);
    expect(r.pending).toEqual([key]);
  });

  it("thresholds are inclusive", () => {
    expect(eval_({ runKm: 5, waterL: 3, proteinG: 84, studyMin: 60, readingMin: 1 }).completed).toBe(true);
  });

  it("uses the member's own targets (study up to 90, run, water)", () => {
    const strict: TrackerConfig = { ...config, studyMinTarget: 90, runTargetKm: 8, waterTargetL: 4 };
    const r = evaluateDay(full, { date: FRI, dayOver: false, config: strict });
    expect(r.pending.sort()).toEqual(["RUN", "STUDY", "WATER"]);
  });
});

describe("AT-09: Sunday, run not required, stretch required", () => {
  const sunday = { runKm: 0, warmupPreDone: false, warmupPostDone: false };

  it("is a Sunday", () => expect(isSunday(SUN)).toBe(true));

  it("completes with stretch only (no run, no warm-ups)", () => {
    const r = eval_({ ...sunday, stretchMin: 25 }, SUN);
    expect(r.completed).toBe(true);
    expect(r.required).not.toContain("RUN");
  });

  it("is incomplete without enough stretching", () => {
    expect(eval_({ ...sunday, stretchMin: 19 }, SUN).pending).toEqual(["STRETCH"]);
    expect(eval_({ ...sunday, stretchMin: 20 }, SUN).completed).toBe(true);
  });

  it("running on Sunday does not replace the stretch", () => {
    expect(eval_({ stretchMin: 0 }, SUN).pending).toEqual(["STRETCH"]);
  });
});

describe("AT-10: a missed task is logged and the day count continues", () => {
  it("while the day runs, unticked tasks are pending, not missed", () => {
    const r = eval_({ runKm: 0 }, FRI, false);
    expect(r.pending).toEqual(["RUN"]);
    expect(r.missed).toEqual([]);
  });

  it("once the day is over, they are logged as missed", () => {
    const r = eval_({ runKm: 0, githubContribution: false }, FRI, true);
    expect(r.missed).toEqual(["RUN", "GITHUB"]);
    expect(r.completed).toBe(false);
  });

  it("the day number keeps incrementing across a missed day (BR4)", () => {
    const start = "2026-11-20";
    expect(dayNumber(start, FRI)).toBe(1);
    expect(dayNumber(start, "2026-11-21")).toBe(2); // day 1 was incomplete; still day 2
    expect(dayNumber(start, "2026-11-22")).toBe(3);
  });
});

describe("day number", () => {
  it("day 1 is the start date; days before it have no number", () => {
    expect(dayNumber("2026-11-20", "2026-11-20")).toBe(1);
    expect(dayNumber("2026-11-20", "2026-11-19")).toBeNull();
  });
  it("reaches 75 on the 75th day and keeps going", () => {
    expect(dayNumber("2026-11-20", addDays("2026-11-20", 74))).toBe(75);
    expect(dayNumber("2026-11-20", addDays("2026-11-20", 80))).toBe(81);
    expect(reachedFinalDay(75)).toBe(true);
    expect(reachedFinalDay(74)).toBe(false);
    expect(reachedFinalDay(null)).toBe(false);
  });
});

describe("dates", () => {
  it("day boundary is local midnight in the member's time zone", () => {
    const instant = new Date("2026-11-20T20:00:00Z"); // 01:30 on the 21st in Kolkata, 15:00 on the 20th in New York
    expect(localDate(instant, "Asia/Kolkata")).toBe("2026-11-21");
    expect(localDate(instant, "America/New_York")).toBe("2026-11-20");
  });
  it("date arithmetic is exact across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
  });
  it("validates date strings strictly", () => {
    expect(isDateString("2026-11-20")).toBe(true);
    for (const bad of ["2026-13-01", "2026-02-30", "20-11-2026", "2026-11-20T00:00", "", "tomorrow"]) expect(isDateString(bad)).toBe(false);
  });
});

describe("protein without a weight", () => {
  it("any logged protein counts until a weight is set", () => {
    expect(taskStatus({ ...full, proteinG: 1 }, DEFAULT_CONFIG).PROTEIN).toBe(true);
    expect(taskStatus({ ...full, proteinG: 0 }, DEFAULT_CONFIG).PROTEIN).toBe(false);
  });
});

describe("perfect days in a row (separate from the day number)", () => {
  const done = (...dates: string[]) => dates.map((date) => ({ date, completed: true }));
  it("counts back from today when today is complete", () => {
    expect(perfectDaysInARow(done("2026-11-20", "2026-11-21", "2026-11-22"), "2026-11-22")).toBe(3);
  });
  it("an unfinished today does not break the run", () => {
    expect(perfectDaysInARow(done("2026-11-20", "2026-11-21"), "2026-11-22")).toBe(2);
  });
  it("a missed day ends the run but nothing else", () => {
    expect(perfectDaysInARow(done("2026-11-19", "2026-11-21", "2026-11-22"), "2026-11-22")).toBe(2);
  });
  it("ignores incomplete days and is zero with no data", () => {
    expect(perfectDaysInARow([{ date: "2026-11-21", completed: false }], "2026-11-22")).toBe(0);
    expect(perfectDaysInARow([], "2026-11-22")).toBe(0);
  });
});

describe("completion % (hand-calculated fixture)", () => {
  // Program started 2026-11-10. Today is 2026-11-20 = day 11.
  // Completed: days 1,2,3 (10th,11th,12th), 5 (14th), 6 (15th), 8 (17th), 9 (18th), 10 (19th). Days 4 and 7 missed.
  const start = "2026-11-10";
  const completedDates = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14", "2026-11-15", "2026-11-17", "2026-11-18", "2026-11-19"];
  const days = completedDates.map((date) => ({ date, completed: true }));

  it("window: 8 of the 10 finished days = 80% (today is excluded while unfinished)", () => {
    expect(completion(days, { startDate: start, today: "2026-11-20" })).toEqual({ completed: 8, elapsed: 10, pct: 80 });
  });

  it("today counts once it is completed: 9 of 11 = 82%", () => {
    const withToday = [...days, { date: "2026-11-20", completed: true }];
    expect(completion(withToday, { startDate: start, today: "2026-11-20" })).toEqual({ completed: 9, elapsed: 11, pct: 82 });
  });

  it("last 7 days: days 4 to 10 → completed days 5,6,8,9,10 = 5 of 7 = 71%", () => {
    expect(completion(days, { startDate: start, today: "2026-11-20", lastDays: 7 })).toEqual({ completed: 5, elapsed: 7, pct: 71 });
  });

  it("is zero before the start and on day 1 before anything is done", () => {
    expect(completion([], { startDate: start, today: "2026-11-09" })).toEqual({ completed: 0, elapsed: 0, pct: 0 });
    expect(completion([], { startDate: start, today: "2026-11-10" })).toEqual({ completed: 0, elapsed: 0, pct: 0 });
  });

  it("is capped at the program length", () => {
    const all = Array.from({ length: 75 }, (_, i) => ({ date: addDays(start, i), completed: true }));
    expect(completion(all, { startDate: start, today: addDays(start, 90) })).toEqual({ completed: 75, elapsed: 75, pct: 100 });
  });

  it("recent window never reaches before day 1", () => {
    expect(completion(days.slice(0, 2), { startDate: start, today: "2026-11-12", lastDays: 7 })).toEqual({ completed: 2, elapsed: 2, pct: 100 });
  });
});

import { longestPerfectRun } from "@/server/tracker";
describe("longest perfect run", () => {
  const d = (...dates: string[]) => dates.map((date) => ({ date, completed: true }));
  it("finds the longest consecutive stretch", () => {
    expect(longestPerfectRun(d("2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"))).toBe(3);
    expect(longestPerfectRun([])).toBe(0);
    expect(longestPerfectRun([{ date: "2026-11-01", completed: false }])).toBe(0);
    expect(longestPerfectRun(d("2026-11-02", "2026-11-02"))).toBe(1);
  });
});

describe("partial credit: below target but started earns half of the task's share", () => {
  it("a full day is 100%, an empty one 0%", () => {
    expect(eval_({}).percent).toBe(100);
    expect(evaluateDay({ ...full, runKm: 0, warmupPreDone: false, warmupPostDone: false, waterL: 0, electrolytesDone: false, proteinG: 0, studyMin: 0, techNote: "", githubContribution: false, readingMin: 0 }, { date: FRI, dayOver: false, config }).percent).toBe(0);
  });

  it("Sunday: stretching is 1 of 8 equal tasks (12.5%), so 15 of 20 minutes earns 6.25% and stays pending", () => {
    const sunFull = { stretchMin: 25 };
    expect(eval_(sunFull, SUN).percent).toBe(100);
    const r = eval_({ stretchMin: 15 }, SUN);
    expect(r.percent).toBe(93.75); // 7 full + half of one, out of 8
    expect(r.partial).toEqual(["STRETCH"]);
    expect(r.pending).toEqual(["STRETCH"]);
    expect(r.completed).toBe(false); // the day itself still needs every target
  });

  it("only numeric-target tasks can be partial; toggles and text are all or nothing", () => {
    const r = eval_({ runKm: 2, waterL: 1, studyMin: 20, proteinG: 40, warmupPreDone: false, electrolytesDone: false, githubContribution: false, techNote: "" });
    expect(r.partial.sort()).toEqual(["PROTEIN", "RUN", "STUDY", "WATER"]);
    expect(r.percent).toBe(40); // full: WARM_POST + SATSANG (2); half: RUN, WATER, PROTEIN, STUDY (2); nothing: the other 4
  });

  it("nothing logged is not partial, and protein without a weight target is not partial", () => {
    expect(eval_({ runKm: 0 }).partial).toEqual([]);
    const noWeight = evaluateDay({ ...full, proteinG: 0 }, { date: FRI, dayOver: false, config: { ...DEFAULT_CONFIG, weightKg: null } });
    expect(noWeight.partial).toEqual([]);
  });

  it("the missed list and day count are unaffected (partial tasks are still missed once the day is over)", () => {
    expect(eval_({ stretchMin: 15 }, SUN, true).missed).toEqual(["STRETCH"]);
  });
});
