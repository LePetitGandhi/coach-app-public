import { describe, expect, it } from "vitest";
import {
  buildWeeklySummary,
  currentStreak,
  emptyDailyLog,
  objectiveProgress,
  scoreDailyLog,
} from "../metrics";
import { DEFAULT_OBJECTIVES } from "../coachPlan";
import type { DailyLog } from "../types";

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return {
    ...emptyDailyLog(date),
    // Journée de référence : cible à 2250 kcal et 140 g de protéines atteinte.
    meals: [
      { id: `${date}-m1`, name: "Repas protéiné", proteinG: 45, calories: 900, quality: "plan" },
      { id: `${date}-m2`, name: "Skyr", proteinG: 35, calories: 600, quality: "plan" },
      { id: `${date}-m3`, name: "Dîner propre", proteinG: 60, calories: 750, quality: "plan" },
    ],
    workouts: [
      {
        id: `${date}-w1`,
        focus: "Upper",
        minutes: 60,
        hardSets: 12,
        progression: true,
        completed: true,
        exercises: [
          {
            id: `${date}-e1`,
            name: "Développé couché",
            sets: [
              { reps: 10, weightKg: 40, rir: 2 },
              { reps: 9, weightKg: 40, rir: 1 },
              { reps: 8, weightKg: 40, rir: 1 },
              { reps: 8, weightKg: 40, rir: 0 },
            ],
          },
        ],
      },
    ],
    body: { weightKg: 69, waistCm: 78 },
    recovery: { sleepHours: 7.7, energy: 4, mood: "solide", steps: 8500, waterL: 2.4 },
    planRespect: 5,
    notes: "Exécution propre",
    ...patch,
  };
}

describe("V2 discipline metrics", () => {
  it("scores a complete transformation day as high execution", () => {
    const score = scoreDailyLog(log("2026-06-01"));

    expect(score.score).toBeGreaterThanOrEqual(90);
    expect(score.breakdown.protein).toBe(30);
    expect(score.breakdown.training).toBe(25);
    expect(score.label).toBe("Exécution de transformation");
  });

  it("points the coach toward the biggest missing lever", () => {
    const score = scoreDailyLog(
      log("2026-06-02", {
        meals: [{ id: "low", name: "Repas incomplet", proteinG: 20, calories: 600, quality: "improvise" }],
        workouts: [],
      }),
    );

    expect(score.score).toBeLessThan(70);
    expect(score.primaryGap).toBe("protéines");
  });

  it("computes current streak from consecutive solid days only", () => {
    const logs = [
      log("2026-06-05"),
      log("2026-06-04"),
      log("2026-06-03", { meals: [], workouts: [], recovery: { energy: 2, mood: "bas" }, planRespect: 2 }),
      log("2026-06-02"),
    ];

    expect(currentStreak(logs, 70, "2026-06-05")).toBe(2);
  });

  it("garde la série intacte quand la journée en cours vient de commencer", () => {
    // Le matin, aujourd'hui est forcément vide : il ne doit pas remettre le
    // compteur à zéro, sinon la série s'éteint chaque nuit.
    const logs = [
      emptyDailyLog("2026-06-05"),
      log("2026-06-04"),
      log("2026-06-03"),
      log("2026-06-02"),
    ];

    expect(currentStreak(logs, 70, "2026-06-05")).toBe(3);
  });

  it("ajoute la journée en cours dès qu'elle passe le seuil", () => {
    const logs = [log("2026-06-05"), log("2026-06-04")];
    expect(currentStreak(logs, 70, "2026-06-05")).toBe(2);
  });

  it("part de zéro quand rien n'a été saisi", () => {
    // Les valeurs par défaut du formulaire (respect du plan à 3, énergie
    // neutre) ne doivent rien rapporter tant que la journée est vierge.
    const score = scoreDailyLog(emptyDailyLog("2026-06-10"));
    expect(score.score).toBe(0);
  });

  it("atteint 100 sans exiger de note écrite", () => {
    const score = scoreDailyLog(log("2026-06-11", { notes: "" }));
    expect(score.score).toBe(100);
  });

  it("pénalise un écart calorique marqué, pas une journée normale", () => {
    const normale = scoreDailyLog(log("2026-06-12"));
    expect(normale.caloriePenalty).toBe(0);

    const exces = scoreDailyLog(
      log("2026-06-13", {
        meals: [{ id: "gros", name: "Craquage", proteinG: 140, calories: 4200, quality: "off" }],
      }),
    );
    expect(exces.caloriePenalty).toBeGreaterThan(0);
    expect(exces.score).toBeLessThan(normale.score);
  });

  it("summarizes weekly adherence and measurement trends", () => {
    const logs = [
      log("2026-06-01", { body: { weightKg: 69.2, waistCm: 78.5 } }),
      log("2026-06-02", { body: { weightKg: 69.1, waistCm: 78.2 } }),
      log("2026-06-03", { workouts: [] }),
      log("2026-06-04"),
      log("2026-06-05", { body: { weightKg: 69.7, waistCm: 77.9 } }),
    ];

    const summary = buildWeeklySummary(logs, undefined, "2026-06-01");

    expect(summary.workoutsDone).toBe(4);
    expect(summary.proteinDays).toBe(5);
    expect(summary.trackingDays).toBe(5);
    expect(summary.weightTrendKg).toBe(0.5);
    expect(summary.waistTrendCm).toBe(-0.6);
  });

  it("relie chaque objectif hebdo à sa mesure", () => {
    const logs = [
      log("2026-06-01"),
      log("2026-06-02"),
      log("2026-06-03", { workouts: [] }),
      log("2026-06-04"),
    ];
    const summary = buildWeeklySummary(logs, undefined, "2026-06-01");

    // Aucun objectif ne doit rester orphelin : c'est le bug qu'on corrige.
    for (const objective of DEFAULT_OBJECTIVES) {
      const progress = objectiveProgress(objective, summary);
      expect(progress, objective.id).toBeGreaterThanOrEqual(0);
      expect(progress, objective.id).toBeLessThanOrEqual(7);
    }

    const workouts = DEFAULT_OBJECTIVES.find((item) => item.kind === "workouts");
    expect(workouts && objectiveProgress(workouts, summary)).toBe(3);

    const tracking = DEFAULT_OBJECTIVES.find((item) => item.kind === "trackingDays");
    expect(tracking && objectiveProgress(tracking, summary)).toBe(4);
  });
});
