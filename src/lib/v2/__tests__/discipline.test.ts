import { describe, expect, it } from "vitest";
import { V2_PROFILE, V2_TARGETS } from "../coachPlan";
import {
  addDaysISO,
  buildCheckin,
  buildWeeklySummary,
  emptyDailyLog,
  logsForWeek,
  mealTotals,
  scoreDailyLog,
} from "../metrics";
import type { DailyLog } from "../types";

function perfectLog(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return {
    ...emptyDailyLog(date),
    // 2250 kcal : la cible exacte, pour qu'aucun malus calorique ne s'applique.
    meals: [
      { id: `${date}-m1`, name: "Poulet riz", proteinG: 50, calories: 950, quality: "plan" },
      { id: `${date}-m2`, name: "Skyr flocons", proteinG: 45, calories: 600, quality: "plan" },
      { id: `${date}-m3`, name: "Poisson patates", proteinG: 50, calories: 700, quality: "plan" },
    ],
    workouts: [
      {
        id: `${date}-w1`,
        focus: "Upper",
        minutes: 60,
        hardSets: 14,
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
    body: { weightKg: 69 },
    recovery: { sleepHours: 8, energy: 5, mood: "solide", steps: 9000, waterL: 2.5 },
    planRespect: 5,
    notes: "Séance propre, rien à signaler.",
    ...patch,
  };
}

describe("Cibles scientifiques (garde-fou anti-régression)", () => {
  it("garde les cibles alignées sur le plan sourcé (OMS/ACSM/ISSN)", () => {
    expect(V2_TARGETS.proteinG).toBe(140); // ≈ 2 g/kg pour 69 kg
    expect(V2_TARGETS.calories).toBe(2250);
    expect(V2_TARGETS.workoutsPerWeek).toBe(4);
    expect(V2_TARGETS.sleepHours).toBe(7.5);
    expect(V2_TARGETS.steps).toBe(8000);
  });

  it("garde le profil cohérent avec les cibles", () => {
    expect(Math.round(V2_PROFILE.weightKg * 2)).toBeCloseTo(V2_TARGETS.proteinG, -1);
    expect(V2_PROFILE.exclusions).toContain("porc");
  });
});

describe("scoreDailyLog — bornes et robustesse", () => {
  it("ne dépasse jamais 100 même sur une journée sur-remplie", () => {
    const log = perfectLog("2026-07-01", {
      meals: Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}`,
        name: "Repas",
        proteinG: 60,
        calories: 800,
        quality: "plan" as const,
      })),
      recovery: { sleepHours: 12, energy: 5, mood: "solide", steps: 30000, waterL: 6 },
    });
    const score = scoreDailyLog(log);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.breakdown.protein).toBe(30);
    expect(score.breakdown.training).toBe(25);
    expect(score.breakdown.recovery).toBe(20);
  });

  it("ne devient jamais négatif même avec beaucoup d'écarts", () => {
    const log = perfectLog("2026-07-01", {
      meals: Array.from({ length: 6 }, (_, i) => ({
        id: `off${i}`,
        name: "Écart",
        proteinG: 5,
        calories: 500,
        quality: "off" as const,
      })),
      workouts: [],
      planRespect: 1,
      recovery: { energy: 1, mood: "bas" },
      notes: "",
      body: {},
    });
    const score = scoreDailyLog(log);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.breakdown.plan).toBe(0);
    expect(score.tone).toBe("alerte");
  });

  it("score une journée vide comme rattrapage immédiat", () => {
    const score = scoreDailyLog(emptyDailyLog("2026-07-01"));
    expect(score.score).toBeLessThan(50);
    expect(score.label).toBe("Rattrapage immédiat");
  });

  it("compte les repas hors plan dans mealTotals", () => {
    const log = perfectLog("2026-07-01", {
      meals: [
        { id: "a", name: "Plan", proteinG: 40, calories: 600, quality: "plan" },
        { id: "b", name: "Écart", proteinG: 10, calories: 900, quality: "off" },
      ],
    });
    expect(mealTotals(log)).toEqual({ proteinG: 50, calories: 1500, offPlanMeals: 1 });
  });
});

describe("Dates — bascules de mois et d'année", () => {
  it("passe correctement les fins de mois et d'année", () => {
    expect(addDaysISO("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2024-03-01", -1)).toBe("2024-02-29"); // année bissextile
  });

  it("logsForWeek ne garde que les 7 jours de la semaine", () => {
    const logs = [
      perfectLog("2026-06-28"), // dimanche précédent
      perfectLog("2026-06-29"), // lundi
      perfectLog("2026-07-05"), // dimanche
      perfectLog("2026-07-06"), // lundi suivant
    ];
    const week = logsForWeek(logs, "2026-06-29");
    expect(week.map((l) => l.date)).toEqual(["2026-06-29", "2026-07-05"]);
  });
});

describe("Coach hebdo — priorités des conseils", () => {
  it("réclame le tracking avant tout si moins de 4 jours notés", () => {
    const summary = buildWeeklySummary([perfectLog("2026-06-29")], undefined, "2026-06-29");
    expect(summary.coachLine).toMatch(/noter|tracking/i);
  });

  it("réclame les séances quand le tracking est bon mais l'entraînement manque", () => {
    const logs = ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"].map((d) =>
      perfectLog(d, { workouts: [] }),
    );
    const summary = buildWeeklySummary(logs, undefined, "2026-06-29");
    expect(summary.workoutsDone).toBe(0);
    expect(summary.coachLine).toMatch(/séances/i);
  });

  it("valide une semaine complète avec le message de maintien", () => {
    const logs = ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03"].map((d) => perfectLog(d));
    const summary = buildWeeklySummary(logs, undefined, "2026-06-29");
    expect(summary.coachLine).toMatch(/Bonne direction/);
  });
});

describe("buildCheckin", () => {
  it("reprend le score et les tendances de la semaine", () => {
    const logs = [
      perfectLog("2026-06-29", { body: { weightKg: 69.4, waistCm: 78.5 } }),
      perfectLog("2026-06-30", { body: { weightKg: 69.0, waistCm: 78.0 } }),
      perfectLog("2026-07-01"),
      perfectLog("2026-07-02"),
    ];
    const checkin = buildCheckin(logs, "4 séances tenues", "sommeil irrégulier", "protéines au petit-déj", "2026-06-29");
    expect(checkin.weekStart).toBe("2026-06-29");
    expect(checkin.score).toBeGreaterThanOrEqual(85);
    expect(checkin.weightTrendKg).toBeCloseTo(-0.4, 5);
    expect(checkin.waistTrendCm).toBeCloseTo(-0.5, 5);
    expect(checkin.wins).toBe("4 séances tenues");
    expect(checkin.coachFeedback.length).toBeGreaterThan(0);
  });
});
