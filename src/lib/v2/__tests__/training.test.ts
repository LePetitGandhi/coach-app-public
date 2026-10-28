import { describe, expect, it } from "vitest";
import {
  bestSet,
  countHardSets,
  epley1RM,
  exerciseHistory,
  formatSet,
  hasProgressed,
  lastPerformance,
  personalRecords,
  progressionAdvice,
  setVolume,
  weeklyVolume,
  workoutVolume,
} from "../training";
import { emptyDailyLog } from "../metrics";
import type { DailyLog, ExerciseLog, SetLog, WorkoutLog } from "../types";

function workout(exercises: ExerciseLog[], overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: "w1",
    focus: "Upper force propre",
    minutes: 60,
    hardSets: 0,
    progression: false,
    completed: true,
    exercises,
    ...overrides,
  };
}

function exercise(name: string, sets: SetLog[], exerciseId?: string): ExerciseLog {
  return { id: `ex-${name}`, name, sets, exerciseId };
}

function dayWith(date: string, exercises: ExerciseLog[]): DailyLog {
  return { ...emptyDailyLog(date), workouts: [workout(exercises)] };
}

describe("setVolume et workoutVolume", () => {
  it("multiplie reps et charge", () => {
    expect(setVolume({ reps: 10, weightKg: 40 })).toBe(400);
  });

  it("compte le poids du corps comme charge nulle", () => {
    expect(setVolume({ reps: 10 })).toBe(0);
  });

  it("additionne sur toute la séance", () => {
    const w = workout([
      exercise("Développé", [{ reps: 10, weightKg: 40 }, { reps: 8, weightKg: 40 }]),
      exercise("Rowing", [{ reps: 12, weightKg: 20 }]),
    ]);
    expect(workoutVolume(w)).toBe(400 + 320 + 240);
  });
});

describe("countHardSets", () => {
  it("compte les séries menées près de l'échec", () => {
    const w = workout([
      exercise("Développé", [
        { reps: 10, weightKg: 40, rir: 2 },
        { reps: 8, weightKg: 40, rir: 1 },
        { reps: 15, weightKg: 10, rir: 6 },
      ]),
    ]);
    expect(countHardSets(w)).toBe(2);
  });

  it("fait confiance aux séries sans RIR renseigné", () => {
    const w = workout([exercise("Traction", [{ reps: 8 }, { reps: 6 }])]);
    expect(countHardSets(w)).toBe(2);
  });

  it("retombe sur la valeur saisie quand aucun exercice n'est détaillé", () => {
    expect(countHardSets(workout([], { hardSets: 12 }))).toBe(12);
  });

  it("ignore les séries à zéro rep", () => {
    expect(countHardSets(workout([exercise("Squat", [{ reps: 0, weightKg: 60 }])]))).toBe(0);
  });
});

describe("epley1RM", () => {
  it("rend la charge telle quelle sur une seule rep", () => {
    expect(epley1RM({ reps: 1, weightKg: 80 })).toBe(80);
  });

  it("majore avec le nombre de répétitions", () => {
    const single = epley1RM({ reps: 1, weightKg: 60 })!;
    const dix = epley1RM({ reps: 10, weightKg: 60 })!;
    expect(dix).toBeGreaterThan(single);
    expect(dix).toBeCloseTo(80, 0);
  });

  it("rend null au poids du corps ou à zéro rep", () => {
    expect(epley1RM({ reps: 10 })).toBeNull();
    expect(epley1RM({ reps: 0, weightKg: 50 })).toBeNull();
  });
});

describe("bestSet", () => {
  it("retient la série au meilleur 1RM estimé", () => {
    const best = bestSet(
      exercise("Développé", [
        { reps: 12, weightKg: 40 },
        { reps: 5, weightKg: 60 },
        { reps: 10, weightKg: 45 },
      ]),
    );
    expect(best).toEqual({ reps: 5, weightKg: 60 });
  });

  it("rend null sans série", () => {
    expect(bestSet(exercise("Vide", []))).toBeNull();
  });
});

describe("formatSet", () => {
  it("distingue charge et poids du corps", () => {
    expect(formatSet({ reps: 10, weightKg: 40 })).toBe("10 × 40 kg");
    expect(formatSet({ reps: 8 })).toBe("8 reps (PdC)");
    expect(formatSet({ reps: 8, weightKg: 40, rir: 2 })).toBe("8 × 40 kg · RIR 2");
  });
});

describe("exerciseHistory et lastPerformance", () => {
  const logs = [
    dayWith("2026-08-10", [exercise("Développé couché", [{ reps: 10, weightKg: 45 }], "0025")]),
    dayWith("2026-08-03", [exercise("Développé couché", [{ reps: 10, weightKg: 40 }], "0025")]),
    dayWith("2026-08-01", [exercise("Squat", [{ reps: 10, weightKg: 60 }], "0043")]),
  ];

  it("retrouve l'historique par identifiant de bibliothèque", () => {
    const history = exerciseHistory(logs, "0025");
    expect(history).toHaveLength(2);
    expect(history[0].date).toBe("2026-08-10");
  });

  it("exclut la séance en cours", () => {
    const previous = lastPerformance(logs, "0025", "2026-08-10");
    expect(previous?.date).toBe("2026-08-03");
  });

  it("rend null si l'exercice est inconnu", () => {
    expect(lastPerformance(logs, "inexistant")).toBeNull();
  });
});

describe("progressionAdvice", () => {
  it("guide la première fois", () => {
    const advice = progressionAdvice([], "0025");
    expect(advice.status).toBe("first");
  });

  it("demande une répétition de plus dans la fourchette", () => {
    const logs = [dayWith("2026-08-03", [exercise("Développé", [{ reps: 9, weightKg: 40 }], "0025")])];
    const advice = progressionAdvice(logs, "0025", "2026-08-10");
    expect(advice.status).toBe("flat");
    expect(advice.suggestedReps).toBe(10);
    expect(advice.suggestedKg).toBe(40);
  });

  it("monte la charge une fois le haut de fourchette atteint", () => {
    const logs = [dayWith("2026-08-03", [exercise("Développé", [{ reps: 12, weightKg: 40 }], "0025")])];
    const advice = progressionAdvice(logs, "0025", "2026-08-10");
    expect(advice.status).toBe("up");
    expect(advice.suggestedKg).toBe(42.5);
    expect(advice.suggestedReps).toBe(8);
  });

  it("gère le poids du corps en visant une répétition de plus", () => {
    const logs = [dayWith("2026-08-03", [exercise("Traction", [{ reps: 6 }], "0652")])];
    const advice = progressionAdvice(logs, "0652", "2026-08-10");
    expect(advice.suggestedReps).toBe(7);
    expect(advice.suggestedKg).toBeUndefined();
  });
});

describe("personalRecords", () => {
  it("garde la meilleure performance par exercice", () => {
    const logs = [
      dayWith("2026-08-10", [exercise("Développé", [{ reps: 8, weightKg: 50 }], "0025")]),
      dayWith("2026-08-03", [exercise("Développé", [{ reps: 10, weightKg: 40 }], "0025")]),
    ];
    const records = personalRecords(logs);
    expect(records).toHaveLength(1);
    expect(records[0].date).toBe("2026-08-10");
    expect(records[0].best.weightKg).toBe(50);
  });
});

describe("weeklyVolume", () => {
  it("additionne le tonnage sur la fenêtre", () => {
    const logs = [
      dayWith("2026-08-04", [exercise("Squat", [{ reps: 10, weightKg: 60 }])]),
      dayWith("2026-08-06", [exercise("Squat", [{ reps: 10, weightKg: 60 }])]),
      dayWith("2026-08-20", [exercise("Squat", [{ reps: 10, weightKg: 60 }])]),
    ];
    expect(weeklyVolume(logs, "2026-08-03", "2026-08-10")).toBe(1200);
  });
});

describe("hasProgressed", () => {
  it("détecte une progression réelle", () => {
    const logs = [dayWith("2026-08-03", [exercise("Développé", [{ reps: 10, weightKg: 40 }], "0025")])];
    const current = workout([exercise("Développé", [{ reps: 10, weightKg: 45 }], "0025")]);
    expect(hasProgressed(logs, current, "2026-08-10")).toBe(true);
  });

  it("ne signale rien quand la performance stagne", () => {
    const logs = [dayWith("2026-08-03", [exercise("Développé", [{ reps: 10, weightKg: 40 }], "0025")])];
    const current = workout([exercise("Développé", [{ reps: 10, weightKg: 40 }], "0025")]);
    expect(hasProgressed(logs, current, "2026-08-10")).toBe(false);
  });
});
