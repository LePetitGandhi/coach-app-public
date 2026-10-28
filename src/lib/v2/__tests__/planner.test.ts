import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { indexFoods, RECIPES_BY_ID, type FoodDatabase } from "../nutrition";
import {
  planShopping as shoppingFor,
  tripDays,
  tripWeights,
  candidatesFor,
  DEFAULT_PREFS,
  EXCLUSIONS,
  generatePlan,
  planShopping,
  plannedDayMacros,
  swapMeal,
  unfillableSlots,
  weeklyBudgetCost,
} from "../planner";

const db = JSON.parse(readFileSync(join(process.cwd(), "public/data/foods.json"), "utf-8")) as FoodDatabase;
const foods = indexFoods(db);

describe("générateur de menu", () => {
  it("est reproductible pour une même graine", () => {
    const a = generatePlan(DEFAULT_PREFS, foods, 42, 100);
    const b = generatePlan(DEFAULT_PREFS, foods, 42, 100);
    expect(a.days.map((day) => day.meals)).toEqual(b.days.map((day) => day.meals));
  });

  it("remplit chaque créneau demandé, chaque jour", () => {
    const plan = generatePlan(DEFAULT_PREFS, foods, 1);
    expect(plan.days).toHaveLength(7);
    for (const day of plan.days) {
      expect(day.meals).toHaveLength(4);
      expect(day.meals.map((id) => RECIPES_BY_ID.get(id)?.type)).toEqual(["petit_dej", "dejeuner", "collation", "diner"]);
    }
  });

  it("vise la cible calorique et protéique sur un plan complet", () => {
    const plan = generatePlan(DEFAULT_PREFS, foods, 7);
    for (const day of plan.days) {
      const macros = plannedDayMacros(day, foods, plan.prefs.store);
      expect(macros.kcal).toBeGreaterThan(2200);
      expect(macros.kcal).toBeLessThan(2900);
      expect(macros.prot).toBeGreaterThan(110);
    }
  });

  it("respecte les exclusions et le temps maximal", () => {
    const prefs = { ...DEFAULT_PREFS, excluded: ["poisson", "boeuf", "en_ligne"] as const, maxMinutes: 15 };
    const plan = generatePlan({ ...prefs, excluded: [...prefs.excluded] }, foods, 3);
    const banned = new Set<string>([...EXCLUSIONS.poisson.foods, ...EXCLUSIONS.boeuf.foods]);
    for (const day of plan.days) {
      for (const id of day.meals) {
        const recipe = RECIPES_BY_ID.get(id)!;
        expect(recipe.minutes).toBeLessThanOrEqual(15);
        expect(recipe.items.some((item) => banned.has(item.foodId))).toBe(false);
      }
    }
  });

  it("ne planifie que les créneaux et jours choisis", () => {
    const plan = generatePlan({ ...DEFAULT_PREFS, slots: ["diner"], days: 5 }, foods, 5);
    expect(plan.days).toHaveLength(5);
    expect(plan.days.every((day) => day.meals.length === 1 && day.extras.length === 0)).toBe(true);
  });

  it("signale les créneaux impossibles", () => {
    const prefs = { ...DEFAULT_PREFS, maxMinutes: 10 };
    expect(candidatesFor("dejeuner", prefs).every((recipe) => recipe.minutes <= 10)).toBe(true);
    expect(unfillableSlots({ ...DEFAULT_PREFS, excluded: ["laitiers", "oeufs", "en_ligne"] }).map((i) => i.slot)).toContain(
      "petit_dej",
    );
  });

  it("tient le budget par défaut", () => {
    const plan = generatePlan(DEFAULT_PREFS, foods, 11);
    expect(weeklyBudgetCost(plan, foods)).toBeLessThanOrEqual(DEFAULT_PREFS.budgetWeek);
  });

  it("produit une liste de courses triée par rayon et cohérente", () => {
    const plan = generatePlan(DEFAULT_PREFS, foods, 9);
    const shopping = planShopping(plan, foods);
    expect(shopping.items.length).toBeGreaterThan(5);
    expect(shopping.items[0].aisle).toBe("frais_vegetal");
    for (const item of shopping.items) {
      expect(item.poidsKg * 1000 + 100).toBeGreaterThanOrEqual(item.enligne ? 0 : item.besoinG);
    }
    expect(shopping.totalPanier).toBeGreaterThanOrEqual(shopping.totalConsomme);
  });

  it("échange un repas contre une autre recette du même créneau", () => {
    const plan = generatePlan(DEFAULT_PREFS, foods, 4);
    const next = swapMeal(plan, 0, 1, foods, 99);
    const before = RECIPES_BY_ID.get(plan.days[0].meals[1])!;
    const after = RECIPES_BY_ID.get(next.days[0].meals[1])!;
    expect(after.id).not.toBe(before.id);
    expect(after.type).toBe(before.type);
    expect(next.days[1]).toBe(plan.days[1]);
  });

  it("répartit la semaine en deux courses, placard à la première", () => {
    const plan = generatePlan({ ...DEFAULT_PREFS, trips: 2 }, foods, 12);
    expect(tripDays(plan, 0)).toEqual([0, 1, 2]);
    expect(tripDays(plan, 1)).toEqual([3, 4, 5, 6]);
    const second = shoppingFor(plan, foods, 1);
    expect(second.items.some((item) => item.placard)).toBe(false);
    const weights = tripWeights(plan, foods);
    expect(weights).toHaveLength(2);
    expect(weights[1]).toBeLessThan(DEFAULT_PREFS.maxCarryKg + 2);
  });

  it("achète les fruits et légumes à la pièce, pas au kilo", () => {
    const plan = generatePlan(DEFAULT_PREFS, foods, 8);
    const list = shoppingFor(plan, foods, 0);
    const vrac = list.items.filter((item) => item.vrac);
    expect(vrac.length).toBeGreaterThan(0);
    for (const item of vrac) expect(item.poidsKg).toBeLessThan(1.2);
  });
});

import { withSeededPlanChanges, type PlannerStore } from "../planner";

describe("changements de menu demandés dans le chat", () => {
  const store: PlannerStore = {
    prefs: DEFAULT_PREFS,
    checked: [],
    plan: {
      createdAt: "2026-09-27T10:00:00.000Z",
      seed: 1,
      prefs: DEFAULT_PREFS,
      days: [
        { day: "Mercredi", meals: ["b_fb", "l_poulet", "s_fb", "d_omelet"], extras: [] },
        { day: "Jeudi", meals: ["b_fb", "l_poulet", "s_fb", "d_omelet"], extras: [] },
      ],
    },
  };

  it("remplace le déjeuner de jeudi le 01/10, une seule fois", () => {
    const once = withSeededPlanChanges(store, "2026-10-01");
    expect(once.plan?.days[1].meals).toEqual(["b_fb", "l_steak_riz", "s_fb_miel", "d_thon_riz_oeufs"]);
    expect(once.plan?.days[0].meals[1]).toBe("l_poulet");
    expect(withSeededPlanChanges(once, "2026-10-01")).toBe(once);
  });

  it("ne touche plus au menu après la date", () => {
    const later = withSeededPlanChanges(store, "2026-10-02");
    expect(later.plan?.days[1].meals[1]).toBe("l_poulet");
    expect(later.appliedSeeds).toContain("plan-2026-10-01-dejeuner");
  });
});

import { SEEDED_PLAN_CHANGES } from "../planner";

describe("menu adapté à la semaine du 01/10", () => {
  it("n'utilise que des recettes existantes, au bon créneau", () => {
    for (const change of SEEDED_PLAN_CHANGES) {
      const recipe = RECIPES_BY_ID.get(change.recipeId);
      expect(recipe, change.recipeId).toBeDefined();
      expect(recipe?.type).toBe(change.slot);
    }
  });

  it("n'utilise que des aliments de la base", () => {
    const db = JSON.parse(readFileSync(join(process.cwd(), "public/data/foods.json"), "utf8")) as FoodDatabase;
    const foods = indexFoods(db);
    for (const change of SEEDED_PLAN_CHANGES) {
      for (const item of RECIPES_BY_ID.get(change.recipeId)?.items ?? []) expect(foods.has(item.foodId), item.foodId).toBe(true);
    }
  });
});
