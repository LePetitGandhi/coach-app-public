import { describe, expect, it } from "vitest";
import { mergeStates } from "../merge";
import { withLocalMerged } from "../sync";
import { emptyDailyLog } from "../metrics";
import type { CoachV2State, DailyLog } from "../types";

function state(dailyLogs: DailyLog[]): CoachV2State {
  return { version: 2, dailyLogs, checkins: [], reminders: [], objectives: [] };
}

const phoneSat: DailyLog = {
  ...emptyDailyLog("2026-10-10"),
  workouts: [
    {
      id: "w-legs",
      focus: "Bas du corps · force",
      minutes: 0,
      hardSets: 0,
      progression: false,
      completed: false,
      exercises: [{ id: "e1", name: "Presse à cuisses", sets: [{ reps: 10, weightKg: 70 }, { reps: 9, weightKg: 70 }] }],
    },
  ],
};

const computerSat: DailyLog = {
  ...emptyDailyLog("2026-10-10"),
  meals: [{ id: "m1", name: "Dîner", calories: 800, proteinG: 59, quality: "plan" }],
  recovery: { energy: 3, mood: "neutre", waterL: 4 },
};

const computerFri: DailyLog = {
  ...emptyDailyLog("2026-10-09"),
  meals: [{ id: "m0", name: "Wraps", calories: 760, proteinG: 35, quality: "improvise" }],
};

describe("fusion de deux appareils", () => {
  it("garde la séance du téléphone ET les repas de l'ordinateur", () => {
    const merged = mergeStates(state([phoneSat]), state([computerSat, computerFri]));
    expect(merged.dailyLogs.map((log) => log.date)).toEqual(["2026-10-10", "2026-10-09"]);
    const sat = merged.dailyLogs[0];
    expect(sat.workouts[0].exercises[0].sets).toHaveLength(2);
    expect(sat.meals.map((meal) => meal.id)).toEqual(["m1"]);
    expect(sat.recovery.waterL).toBe(4);
  });

  it("ne duplique pas un repas présent des deux côtés et garde la version la plus remplie d'une séance", () => {
    const partial = { ...phoneSat, workouts: [{ ...phoneSat.workouts[0], exercises: [{ ...phoneSat.workouts[0].exercises[0], sets: [] }] }] };
    const merged = mergeStates(state([{ ...partial, meals: computerSat.meals }]), state([{ ...phoneSat, meals: computerSat.meals }]));
    expect(merged.dailyLogs[0].meals).toHaveLength(1);
    expect(merged.dailyLogs[0].workouts[0].exercises[0].sets).toHaveLength(2);
  });

  it("fusionne l'état local dans la version serveur pendant la synchro", () => {
    const remote = { "coach.v2.state": JSON.stringify(state([phoneSat])), "coach.v2.pantry": "srv" };
    const local = { "coach.v2.state": JSON.stringify(state([computerSat, computerFri])), "coach.v2.pantry": "loc" };
    const result = withLocalMerged(remote, local);
    const merged = JSON.parse(result["coach.v2.state"] as string) as CoachV2State;
    expect(merged.dailyLogs).toHaveLength(2);
    expect(merged.dailyLogs[0].workouts).toHaveLength(1);
    expect(result["coach.v2.pantry"]).toBe("srv");
  });
});
