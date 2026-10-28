import { describe, expect, it } from "vitest";
import { pastWorkouts } from "../../../components/v2/WorkoutHistory";
import { emptyDailyLog } from "../metrics";
import type { DailyLog, WorkoutLog } from "../types";

function workout(id: string, completed: boolean, reps: number[]): WorkoutLog {
  return {
    id,
    focus: "Bas du corps · force",
    minutes: 0,
    hardSets: 0,
    progression: false,
    completed,
    exercises: [{ id: `${id}-ex`, name: "Presse à cuisses", sets: reps.map((r) => ({ weightKg: 70, reps: r })) }],
  };
}

function log(date: string, workouts: WorkoutLog[]): DailyLog {
  return { ...emptyDailyLog(date), workouts };
}

describe("séances passées", () => {
  it("montre une séance non terminée dès qu'une série est notée, et ignore les vides et aujourd'hui", () => {
    const logs = [
      log("2026-10-11", [workout("today", false, [10])]),
      log("2026-10-10", [workout("sat", false, [10, 9])]),
      log("2026-10-09", [workout("empty", false, [])]),
      log("2026-10-07", [workout("wed", true, [12])]),
    ];
    const past = pastWorkouts(logs, "2026-10-11");
    expect(past.map((item) => item.workout.id)).toEqual(["sat", "wed"]);
  });
});
