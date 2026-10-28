/**
 * Le frigo : ce qu'Aïmen a vraiment chez lui, en grammes par aliment.
 *
 * Alimenté par les articles cochés de la liste de courses (et le premier ticket
 * Aldi), vidé automatiquement quand un repas du plan ou un aliment à la
 * portion est noté. Sert à proposer les recettes faisables tout de suite et à
 * dire ce qui manque.
 */

import { RECIPES, RECIPES_BY_ID, type Food, type Recipe } from "./nutrition";
import type { MealLog } from "./types";

export const PANTRY_KEY = "coach.v2.pantry";

export type Pantry = Record<string, number>;

/**
 * Premier ticket Aldi (28/09), moins le déjeuner du jour (≈ 170 g de pâtes,
 * 2 œufs, 12 g d'huile, 170 g de sauce, 70 g d'emmental).
 */
export const INITIAL_PANTRY: Pantry = {
  sauce_tomate: 340,
  huile_olive: 488,
  lentilles_conserve: 320,
  oeufs: 610,
  macaronis: 830,
  emmental_rape: 130,
  ail: 150,
  poivron: 500,
  aubergine: 500,
  tomate: 660,
  mandarine: 750,
  oignon: 500,
};

/** Ingrédients mineurs : jamais bloquants pour dire qu'une recette est faisable. */
const MINOR = new Set(["ail", "herbes_provence", "huile_olive", "miel"]);

export function loadPantry(): Pantry {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PANTRY_KEY);
    if (raw == null) return { ...INITIAL_PANTRY };
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Pantry) : {};
  } catch {
    return {};
  }
}

export function savePantry(pantry: Pantry) {
  try {
    localStorage.setItem(PANTRY_KEY, JSON.stringify(pantry));
    window.dispatchEvent(new Event("coach:pantry"));
  } catch {
    // ignoré
  }
}

/** Ajuste un stock. Une entrée à 0 est gardée : l'aliment reste « suivi ». */
export function adjust(pantry: Pantry, foodId: string, grams: number): Pantry {
  return { ...pantry, [foodId]: Math.max(0, Math.round((pantry[foodId] ?? 0) + grams)) };
}

export function removeFood(pantry: Pantry, foodId: string): Pantry {
  const copy = { ...pantry };
  delete copy[foodId];
  return copy;
}

/** Grammes consommés par un repas noté (recette × portion, ou aliment à la portion). */
export function mealUsage(meal: MealLog): { foodId: string; grams: number }[] {
  if (!meal.sourceId) return [];
  const recipe = RECIPES_BY_ID.get(meal.sourceId);
  if (recipe) {
    const factor = meal.portion ?? 1;
    return recipe.items.map((item) => ({ foodId: item.foodId, grams: item.grams * factor }));
  }
  if (meal.grams) return [{ foodId: meal.sourceId, grams: meal.grams }];
  return [];
}

/** Applique au frigo la différence entre deux listes de repas (ajouts consomment, retraits rendent). */
export function applyMealDiff(pantry: Pantry, before: MealLog[], after: MealLog[]): Pantry {
  const beforeIds = new Set(before.map((meal) => meal.id));
  const afterIds = new Set(after.map((meal) => meal.id));
  let next = pantry;
  for (const meal of after) {
    if (beforeIds.has(meal.id)) continue;
    for (const use of mealUsage(meal)) if (next[use.foodId] != null) next = adjust(next, use.foodId, -use.grams);
  }
  for (const meal of before) {
    if (afterIds.has(meal.id)) continue;
    for (const use of mealUsage(meal)) if (next[use.foodId] != null) next = adjust(next, use.foodId, use.grams);
  }
  return next;
}

export type Feasible = { recipe: Recipe; missing: string[] };

/** Recettes faisables avec le frigo (ingrédients mineurs ignorés), les plus protéinées d'abord. */
export function feasibleRecipes(pantry: Pantry, foods: Map<string, Food>, slack = 0.8): Feasible[] {
  const result: (Feasible & { prot: number })[] = [];
  for (const recipe of RECIPES) {
    const missing = recipe.items
      .filter((item) => !MINOR.has(item.foodId) && (pantry[item.foodId] ?? 0) < item.grams * slack)
      .map((item) => foods.get(item.foodId)?.nom.split(" (")[0] ?? item.foodId);
    const prot = recipe.items.reduce((sum, item) => sum + ((foods.get(item.foodId)?.prot ?? 0) * item.grams) / 100, 0);
    result.push({ recipe, missing, prot });
  }
  return result.sort((a, b) => a.missing.length - b.missing.length || b.prot - a.prot);
}

/** Sources de protéines au frigo, triées par densité, avec la quantité pour combler `neededG`. */
export function proteinTopUp(pantry: Pantry, foods: Map<string, Food>, neededG: number) {
  const options = Object.entries(pantry)
    .map(([foodId, grams]) => ({ food: foods.get(foodId), grams }))
    .filter((item): item is { food: Food; grams: number } => Boolean(item.food && item.food.prot >= 8 && item.grams > 0))
    .sort((a, b) => b.food.prot - a.food.prot);
  const plan: { food: Food; grams: number; protein: number }[] = [];
  let left = neededG;
  for (const option of options) {
    if (left <= 3 || plan.length >= 2) break;
    const grams = Math.min(option.grams, Math.ceil(((left / option.food.prot) * 100) / 10) * 10);
    if (grams < 20) continue;
    const protein = Math.round((option.food.prot * grams) / 100);
    plan.push({ food: option.food, grams, protein });
    left -= protein;
  }
  return { plan, left: Math.max(0, Math.round(left)) };
}
