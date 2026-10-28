import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { indexFoods, recipeToMeal, RECIPES_BY_ID, type FoodDatabase } from "../nutrition";
import { applyMealDiff, feasibleRecipes, INITIAL_PANTRY, proteinTopUp } from "../pantry";
import { weightTrend } from "../weight";
import { emptyDailyLog } from "../metrics";

const db = JSON.parse(readFileSync(join(process.cwd(), "public/data/foods.json"), "utf-8")) as FoodDatabase;
const foods = indexFoods(db);

describe("frigo", () => {
  it("se vide quand on note une recette (portion comprise) et se remplit si on l'annule", () => {
    const meal = recipeToMeal(RECIPES_BY_ID.get("l_pates_emmental")!, foods, "m1", 1.5);
    const after = applyMealDiff(INITIAL_PANTRY, [], [meal]);
    expect(after.macaronis).toBe(INITIAL_PANTRY.macaronis - 195);
    const back = applyMealDiff(after, [meal], []);
    expect(back.macaronis).toBe(INITIAL_PANTRY.macaronis);
  });

  it("ne crée pas de stock pour un aliment jamais acheté", () => {
    const meal = recipeToMeal(RECIPES_BY_ID.get("l_poulet")!, foods, "m2");
    const after = applyMealDiff({}, [], [meal]);
    expect(after.poulet_filet).toBeUndefined();
  });

  it("trouve les pâtes faisables avec le premier ticket", () => {
    const ready = feasibleRecipes(INITIAL_PANTRY, foods).filter((item) => !item.missing.length).map((item) => item.recipe.id);
    expect(ready).toContain("l_pates_emmental");
  });

  it("propose de quoi combler les protéines avec le frigo", () => {
    const topUp = proteinTopUp(INITIAL_PANTRY, foods, 30);
    expect(topUp.plan.length).toBeGreaterThan(0);
    expect(topUp.plan.reduce((sum, item) => sum + item.protein, 0) + topUp.left).toBeGreaterThanOrEqual(29);
  });
});

describe("poids", () => {
  it("compare les moyennes sur 7 jours", () => {
    const logs = [
      { ...emptyDailyLog("2026-10-12"), body: { weightKg: 71.4 } },
      { ...emptyDailyLog("2026-10-10"), body: { weightKg: 71.0 } },
      { ...emptyDailyLog("2026-10-05"), body: { weightKg: 70.8 } },
      { ...emptyDailyLog("2026-10-03"), body: { weightKg: 70.6 } },
    ];
    const trend = weightTrend(logs, new Date(2026, 9, 12, 9));
    expect(trend.avg7).toBe(71.2);
    expect(trend.prevAvg7).toBe(70.7);
    expect(trend.delta).toBe(0.5);
  });
});
