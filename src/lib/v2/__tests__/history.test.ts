import { describe, expect, it } from "vitest";
import { MAY_2026_LOG, withHistory } from "../history";
import { progressionAdvice } from "../training";
import { TRAINING_SPLIT } from "../coachPlan";

describe("historique de mai 2026", () => {
  it("s'ajoute une seule fois", () => {
    const once = withHistory({ dailyLogs: [] });
    expect(once.dailyLogs).toHaveLength(1);
    expect(withHistory(once)).toBe(once);
  });

  it("propose une reprise à ~85 % après une longue pause", () => {
    const advice = progressionAdvice([MAY_2026_LOG], "Chest press", "2026-09-28", [6, 8]);
    expect(advice.status).toBe("down");
    expect(advice.suggestedKg).toBe(37.5);
    expect(advice.suggestedReps).toBe(6);
  });

  it("applique la règle normale quand la dernière séance est récente", () => {
    const advice = progressionAdvice([MAY_2026_LOG], "Lat pulldown", "2026-06-07", [8, 10]);
    expect(advice.status).toBe("flat");
    expect(advice.suggestedKg).toBe(35);
    expect(advice.suggestedReps).toBe(10);
  });

  it("utilise les mêmes noms que les séances types", () => {
    const planned = new Set(TRAINING_SPLIT.flatMap((session) => session.exercises.map((exercise) => exercise.name)));
    for (const exercise of MAY_2026_LOG.workouts[0].exercises) expect(planned.has(exercise.name)).toBe(true);
  });
});

import {
  SEEDED_MEALS,
  SEEDED_RECOVERY,
  SEEDED_WEIGHTS,
  SEEDED_WORKOUT_PATCHES,
  SEEDED_WORKOUT_REMOVALS,
  SEEDED_WORKOUTS,
  withSeededMeals,
  withSeededRecovery,
  withSeededWorkoutPatches,
  withSeededWorkoutRemovals,
  withSeededWorkouts,
} from "../history";
import { budgetPeriod, periodSummary, withSeededTickets, type Purchase } from "../purchases";
import { emptyDailyLog } from "../metrics";
import { formatSet } from "../training";
import type { DailyLog, WorkoutLog } from "../types";

/*
 * Les données saisies depuis le chat (repas, pesées, séances, tickets) sont
 * personnelles et ne sont pas publiées : les tests utilisent des jeux fictifs.
 */

function dayWith(date: string, exercises: WorkoutLog["exercises"] = []): DailyLog {
  return {
    ...emptyDailyLog(date),
    workouts: exercises.length
      ? [{ id: "w", focus: "Haut du corps · force", minutes: 60, hardSets: 8, progression: true, completed: false, exercises }]
      : [],
  };
}

const meal = (id: string, name: string, calories: number, proteinG: number) => ({
  id,
  name,
  calories,
  proteinG,
  quality: "plan" as const,
});

const DEMO_MEALS: typeof SEEDED_MEALS = [
  { seedId: "demo-01-05-dejeuner", date: "2026-01-05", meal: meal("demo-01-05-dejeuner", "Riz, poulet, légumes", 800, 50), sameAs: { sourceId: "l_poulet_riz" } },
  { seedId: "demo-01-05-diner", date: "2026-01-05", meal: meal("demo-01-05-diner", "Omelette 3 œufs, pâtes", 650, 35) },
  { seedId: "demo-01-05-collation", date: "2026-01-05", meal: meal("demo-01-05-collation", "Fromage blanc + banane", 220, 15), sameAs: { nameIncludes: "fromage blanc" } },
  { seedId: "demo-01-06-dejeuner", date: "2026-01-06", meal: meal("demo-01-06-dejeuner", "Lentilles, thon, tomates", 700, 55) },
];
const DEMO_WEIGHTS: typeof SEEDED_WEIGHTS = [{ seedId: "demo-01-06-poids", date: "2026-01-06", weightKg: 75, note: "Pesée à jeun" }];

describe("repas saisis depuis le chat", () => {
  it("s'ajoutent une fois, même si le jour n'existe pas encore", () => {
    const once = withSeededMeals({ dailyLogs: [] as DailyLog[] }, DEMO_MEALS, DEMO_WEIGHTS);
    expect(once.dailyLogs.map((log) => log.date)).toEqual(["2026-01-06", "2026-01-05"]);
    expect(once.dailyLogs.find((log) => log.date === "2026-01-05")?.meals.map((m) => m.id)).toContain("demo-01-05-dejeuner");
    expect(once.dailyLogs.find((log) => log.date === "2026-01-06")?.body.weightKg).toBe(75);
    expect(withSeededMeals(once, DEMO_MEALS, DEMO_WEIGHTS)).toBe(once);
  });

  it("ne reviennent pas après suppression", () => {
    const once = withSeededMeals({ dailyLogs: [] as DailyLog[] }, DEMO_MEALS, DEMO_WEIGHTS);
    const removed = { ...once, dailyLogs: once.dailyLogs.map((log) => ({ ...log, meals: [] })) };
    expect(withSeededMeals(removed, DEMO_MEALS, DEMO_WEIGHTS).dailyLogs.every((log) => log.meals.length === 0)).toBe(true);
  });

  it("ne double pas un repas marqué comme mangé ni un aliment saisi à la main", () => {
    const day = {
      ...emptyDailyLog("2026-01-05"),
      meals: [
        { ...meal("m1", "Poulet, riz basmati", 780, 48), sourceId: "l_poulet_riz" },
        meal("m2", "Fromage blanc + miel", 210, 19),
      ],
    };
    const meals = withSeededMeals({ dailyLogs: [day] }, DEMO_MEALS, DEMO_WEIGHTS).dailyLogs.find((log) => log.date === "2026-01-05")?.meals.map((m) => m.id) ?? [];
    expect(meals).toContain("m1");
    expect(meals).not.toContain("demo-01-05-dejeuner");
    expect(meals).not.toContain("demo-01-05-collation");
    expect(meals).toContain("demo-01-05-diner");
  });

  it("ne change rien sans données saisies", () => {
    const state = { dailyLogs: [] as DailyLog[] };
    expect(SEEDED_MEALS).toHaveLength(0);
    expect(withSeededMeals(state)).toBe(state);
  });
});

const DEMO_WORKOUTS: typeof SEEDED_WORKOUTS = [
  {
    seedId: "demo-01-05-seance",
    date: "2026-01-05",
    anchor: "Chest press",
    replaced: "Rowing poulie basse",
    exercises: [
      {
        id: "demo-pulldown",
        name: "Pull down disques (unilatéral)",
        target: "3 × 10-12 par bras",
        repRange: [10, 12],
        replacedFrom: "Rowing poulie basse",
        sets: [
          { weightKg: 10, reps: 12 },
          { weightKg: 15, reps: 10 },
          { weightKg: 15, reps: 10 },
        ],
      },
      { id: "demo-shoulder", name: "Shoulder press machine", target: "3 × 8-12", repRange: [8, 12], sets: [{ weightKg: 10, reps: 10, rir: 0 }] },
      {
        id: "demo-curl",
        name: "Curl pupitre machine",
        target: "2 × 8-12",
        repRange: [8, 12],
        sets: [
          { weightKg: 15, reps: 10 },
          { weightKg: 15, reps: 8 },
        ],
      },
    ],
  },
];

describe("séries saisies depuis le chat", () => {
  const started = dayWith("2026-01-05", [
    { id: "c", name: "Chest press", sets: [{ weightKg: 40, reps: 10, rir: 2 }] },
    { id: "s", name: "Shoulder press machine", sets: [] },
    { id: "r", name: "Rowing poulie basse", sets: [] },
    { id: "p", name: "Curl pupitre machine", sets: [] },
  ]);

  it("complète la séance sans dupliquer ni écraser", () => {
    const once = withSeededWorkouts({ dailyLogs: [started] }, DEMO_WORKOUTS);
    const exercises = once.dailyLogs[0].workouts[0].exercises;
    expect(exercises.find((e) => e.name === "Chest press")?.sets).toHaveLength(1);
    expect(exercises.find((e) => e.name === "Shoulder press machine")?.sets).toEqual([{ weightKg: 10, reps: 10, rir: 0 }]);
    expect(exercises.find((e) => e.name === "Curl pupitre machine")?.sets).toHaveLength(2);
    expect(exercises.find((e) => e.name === "Rowing poulie basse")?.skipped).toBe(true);
    expect(exercises.find((e) => e.name === "Pull down disques (unilatéral)")?.sets).toHaveLength(3);
    expect(exercises.filter((e) => e.name === "Shoulder press machine")).toHaveLength(1);
    expect(withSeededWorkouts(once, DEMO_WORKOUTS)).toBe(once);
  });

  it("attend la vraie séance au lieu d'en créer une", () => {
    const empty = withSeededWorkouts<{ dailyLogs: DailyLog[]; appliedSeeds?: string[] }>({ dailyLogs: [] }, DEMO_WORKOUTS);
    expect(empty.dailyLogs).toHaveLength(0);
    expect(empty.appliedSeeds ?? []).not.toContain("demo-01-05-seance");
  });

  it("ne touche pas un exercice déjà rempli", () => {
    const filled = dayWith("2026-01-05", [
      { id: "c", name: "Chest press", sets: [{ weightKg: 40, reps: 10 }] },
      { id: "s", name: "Shoulder press machine", sets: [{ weightKg: 12.5, reps: 8 }] },
    ]);
    const result = withSeededWorkouts({ dailyLogs: [filled] }, DEMO_WORKOUTS);
    expect(result.dailyLogs[0].workouts[0].exercises.find((e) => e.name === "Shoulder press machine")?.sets).toEqual([{ weightKg: 12.5, reps: 8 }]);
  });

  it("ne change rien sans données saisies", () => {
    const state = { dailyLogs: [started] };
    expect(SEEDED_WORKOUTS).toHaveLength(0);
    expect(withSeededWorkouts(state)).toBe(state);
  });
});

const DEMO_RECOVERY: typeof SEEDED_RECOVERY = [
  { seedId: "demo-01-05-eau-pas", date: "2026-01-05", waterL: 2.5, steps: 12000 },
  { seedId: "demo-01-06-eau-pas", date: "2026-01-06", waterL: 2, steps: 9000, sleepHours: 7 },
  { seedId: "demo-01-06-sieste", date: "2026-01-06", napHours: 1 },
  { seedId: "demo-01-07-repos", date: "2026-01-07", restDay: true },
  { seedId: "demo-01-05-sans-ptidej", date: "2026-01-05", skippedMeals: ["petit_dej"] },
  { seedId: "demo-01-06-sans-ptidej", date: "2026-01-06", skippedMeals: ["petit_dej"] },
];

describe("récupération saisie depuis le chat", () => {
  it("remplit les jours une seule fois, sans écraser", () => {
    const once = withSeededRecovery({ dailyLogs: [dayWith("2026-01-05")] }, DEMO_RECOVERY);
    const monday = once.dailyLogs.find((log) => log.date === "2026-01-05");
    const tuesday = once.dailyLogs.find((log) => log.date === "2026-01-06");
    expect(monday?.recovery).toMatchObject({ waterL: 2.5, steps: 12000 });
    expect(monday?.recovery.sleepHours).toBeUndefined();
    expect(tuesday?.recovery).toMatchObject({ waterL: 2, steps: 9000, sleepHours: 8 });
    expect(once.dailyLogs.find((log) => log.date === "2026-01-07")?.restDay).toBe(true);
    expect(withSeededRecovery(once, DEMO_RECOVERY)).toBe(once);

    const typed = dayWith("2026-01-05");
    typed.recovery = { ...typed.recovery, waterL: 3 };
    const kept = withSeededRecovery({ dailyLogs: [typed] }, DEMO_RECOVERY).dailyLogs.find((log) => log.date === "2026-01-05");
    expect(kept?.recovery).toMatchObject({ waterL: 3, steps: 12000 });
  });

  it("marque les repas sautés sans doublon", () => {
    const once = withSeededRecovery({ dailyLogs: [{ ...dayWith("2026-01-05"), skippedMeals: ["petit_dej" as const] }] }, DEMO_RECOVERY);
    for (const date of ["2026-01-05", "2026-01-06"]) {
      expect(once.dailyLogs.find((log) => log.date === date)?.skippedMeals).toEqual(["petit_dej"]);
    }
  });

  it("ne change rien sans données saisies", () => {
    const state = { dailyLogs: [dayWith("2026-01-05")] };
    expect(SEEDED_RECOVERY).toHaveLength(0);
    expect(withSeededRecovery(state)).toBe(state);
  });
});

const DEMO_TICKETS: Purchase[] = [
  { id: "ticket-demo-1", date: "2026-01-05", shop: "Supermarché", total: 12.5, lines: [{ label: "Œufs ×12", price: 3.5 }, { label: "Riz 1 kg", price: 2 }, { label: "Poulet 500 g", price: 7 }] },
  { id: "ticket-demo-2", date: "2026-01-08", shop: "Supermarché", total: 4, lines: [{ label: "Fromage blanc", price: 2 }, { label: "Bananes", price: 2 }] },
];

describe("tickets importés", () => {
  it("s'ajoutent une fois, et ne reviennent pas après suppression", () => {
    const first = withSeededTickets([], [], DEMO_TICKETS);
    expect(first.list.map((p) => p.id)).toEqual(["ticket-demo-1", "ticket-demo-2"]);
    for (const ticket of first.list) {
      expect(ticket.lines?.reduce((sum, line) => sum + line.price, 0)).toBeCloseTo(ticket.total, 2);
    }
    expect(withSeededTickets(first.list, first.seeded, DEMO_TICKETS).list).toBe(first.list);
    expect(withSeededTickets([], first.seeded, DEMO_TICKETS).list).toHaveLength(0);
  });
});

describe("budget sur 4 semaines", () => {
  it("découpe des périodes de 28 jours depuis le début du programme", () => {
    expect(budgetPeriod("2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-25", next: "2026-10-26" });
    expect(budgetPeriod("2026-10-25").start).toBe("2026-09-28");
    expect(budgetPeriod("2026-10-26")).toEqual({ start: "2026-10-26", end: "2026-11-22", next: "2026-11-23" });
    expect(budgetPeriod("2026-09-27").end).toBe("2026-09-27");
  });

  it("additionne les tickets d'une même période seulement", () => {
    const list = [
      { id: "a", date: "2026-09-28", shop: "A", total: 26.37 },
      { id: "b", date: "2026-10-01", shop: "B", total: 39.53 },
      { id: "c", date: "2026-10-26", shop: "B", total: 10 },
    ];
    const summary = periodSummary(list, "2026-10-01");
    expect(summary.spent).toBe(65.9);
    expect(summary.left).toBe(234.1);
  });
});

const DEMO_PATCHES: typeof SEEDED_WORKOUT_PATCHES = [
  {
    seedId: "demo-patch-1",
    date: "2026-01-05",
    weightFixes: [{ exercise: "Shoulder press machine", setIndex: 1, from: 12, to: 12.5 }],
    replacementNote: { replacedFrom: "Rowing poulie basse", note: "Charges par bras." },
    workoutNote: "Cardio : 20 min de marche inclinée.",
  },
  {
    seedId: "demo-patch-2",
    date: "2026-01-07",
    weightFixes: [],
    renames: [{ from: "Mollets à la presse", to: "Mollets debout haltères", note: "Sur une marche." }],
    fillSets: [{ exercise: "Planche", sets: [{ reps: 1, seconds: 90 }, { reps: 1, seconds: 60 }] }],
    complete: true,
  },
];

describe("correctifs de séance", () => {
  it("corrige une charge et annote l'exercice remplacé et la séance", () => {
    const day = dayWith("2026-01-05", [
      { id: "s", name: "Shoulder press machine", sets: [{ weightKg: 10, reps: 10 }, { weightKg: 12, reps: 8 }] },
      { id: "u", name: "Pull down disques (unilatéral)", replacedFrom: "Rowing poulie basse", sets: [{ weightKg: 20, reps: 10 }] },
    ]);
    const once = withSeededWorkoutPatches({ dailyLogs: [day] }, DEMO_PATCHES);
    const workout = once.dailyLogs[0].workouts[0];
    expect(workout.exercises[0].sets[1].weightKg).toBe(12.5);
    expect(workout.exercises[0].sets[0].weightKg).toBe(10);
    expect(workout.exercises[1].note).toContain("par bras");
    expect(workout.note).toContain("marche inclinée");
    expect(withSeededWorkoutPatches(once, DEMO_PATCHES)).toBe(once);
  });

  it("attend que la séance soit sur l'appareil", () => {
    const result = withSeededWorkoutPatches<{ dailyLogs: DailyLog[]; appliedSeeds?: string[] }>({ dailyLogs: [] }, DEMO_PATCHES);
    expect(result.appliedSeeds ?? []).not.toContain("demo-patch-1");
  });

  it("renomme un exercice, ajoute des séries en durée et termine la séance", () => {
    const log: DailyLog = {
      ...emptyDailyLog("2026-01-07"),
      workouts: [
        {
          id: "w",
          focus: "Bas du corps · force",
          minutes: 0,
          hardSets: 0,
          progression: false,
          completed: false,
          exercises: [
            { id: "a", name: "Presse à cuisses", sets: [{ reps: 10, weightKg: 40 }] },
            { id: "b", name: "Mollets à la presse", sets: [{ reps: 15 }] },
            { id: "c", name: "Planche", sets: [] },
          ],
        },
      ],
    };
    const state = withSeededWorkoutPatches({ dailyLogs: [log], appliedSeeds: ["demo-patch-1"] }, DEMO_PATCHES);
    const workout = state.dailyLogs[0].workouts[0];
    expect(workout.completed).toBe(true);
    expect(workout.exercises[1].name).toBe("Mollets debout haltères");
    expect(workout.exercises[1].replacedFrom).toBe("Mollets à la presse");
    expect(workout.exercises[2].sets.map(formatSet)).toEqual(["1 min 30", "1 min"]);
    expect(withSeededWorkoutPatches(state, DEMO_PATCHES)).toBe(state);
  });
});

describe("séance enregistrée par erreur", () => {
  it("est retirée une seule fois, sans toucher aux repas", () => {
    const removals: typeof SEEDED_WORKOUT_REMOVALS = [{ seedId: "demo-remove", date: "2026-01-08" }];
    const day: DailyLog = {
      ...emptyDailyLog("2026-01-08"),
      meals: [meal("m", "Petit-déj", 600, 40)],
      workouts: [{ id: "w", focus: "Haut du corps · volume", minutes: 0, hardSets: 0, progression: false, completed: true, exercises: [] }],
    };
    const once = withSeededWorkoutRemovals({ dailyLogs: [day] }, removals);
    expect(once.dailyLogs[0].workouts).toHaveLength(0);
    expect(once.dailyLogs[0].meals).toHaveLength(1);
    const later = { ...once, dailyLogs: [{ ...once.dailyLogs[0], workouts: day.workouts }] };
    expect(withSeededWorkoutRemovals(later, removals).dailyLogs[0].workouts).toHaveLength(1);
  });
});
