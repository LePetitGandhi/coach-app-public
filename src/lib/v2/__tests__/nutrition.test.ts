import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildShoppingList,
  compareStores,
  DAYS,
  dayMacros,
  foodMacros,
  foodToMeal,
  indexFoods,
  recipeMacros,
  recipeToMeal,
  RECIPES,
  RECIPES_BY_ID,
  weekMacros,
  WEEK_MENU,
  WEEK_MENU_LIQUID,
  menuFor,
  type FoodDatabase,
} from "../nutrition";

const db = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/foods.json"), "utf-8"),
) as FoodDatabase;
const foods = indexFoods(db);

describe("base d'aliments", () => {
  it("est chargée et cohérente", () => {
    expect(db.aliments.length).toBeGreaterThan(25);
    for (const food of db.aliments) {
      expect(food.poids).toBeGreaterThan(0);
      expect(food.prix.match).toBeGreaterThan(0);
      expect(food.prix.auchan).toBeGreaterThan(0);
    }
  });

  it("couvre tous les aliments référencés par les recettes", () => {
    for (const recipe of RECIPES) {
      for (const item of recipe.items) {
        expect(foods.has(item.foodId), `${recipe.id} → ${item.foodId}`).toBe(true);
      }
    }
  });
});

describe("foodMacros", () => {
  it("calcule au prorata de la quantité", () => {
    const poulet = foods.get("poulet_filet")!;
    const macros = foodMacros(poulet, 200);
    expect(macros.prot).toBe(Math.round(poulet.prot * 2));
    expect(macros.kcal).toBe(Math.round(poulet.kcal * 2));
  });

  it("calcule le coût au prorata du conditionnement", () => {
    const poulet = foods.get("poulet_filet")!;
    const macros = foodMacros(poulet, poulet.poids);
    expect(macros.cost).toBeCloseTo(poulet.prix.match, 2);
  });

  it("distingue les deux enseignes", () => {
    const poulet = foods.get("poulet_filet")!;
    expect(foodMacros(poulet, 1000, "match").cost).not.toBe(foodMacros(poulet, 1000, "auchan").cost);
  });
});

describe("recettes", () => {
  it("tiennent toutes en 20 minutes ou moins", () => {
    for (const recipe of RECIPES) {
      expect(recipe.minutes, recipe.nom).toBeLessThanOrEqual(20);
    }
  });

  it("ont toutes des étapes", () => {
    for (const recipe of RECIPES) {
      expect(recipe.etapes.length, recipe.nom).toBeGreaterThan(0);
    }
  });

  it("ne contiennent aucun porc", () => {
    const interdits = ["porc", "jambon", "lardon", "bacon", "saucisson"];
    for (const recipe of RECIPES) {
      const texte = `${recipe.nom} ${recipe.etapes.join(" ")}`.toLowerCase();
      for (const mot of interdits) expect(texte.includes(mot), `${recipe.nom} / ${mot}`).toBe(false);
    }
  });

  it("se convertissent en entrée de journal", () => {
    const recipe = RECIPES_BY_ID.get("l_poulet")!;
    const meal = recipeToMeal(recipe, foods, "meal-1");
    const macros = recipeMacros(recipe, foods);
    expect(meal.proteinG).toBe(macros.prot);
    expect(meal.calories).toBe(macros.kcal);
    expect(meal.sourceId).toBe("l_poulet");
  });
});

describe("menu de la semaine", () => {
  it("couvre les sept jours avec quatre prises", () => {
    for (const day of DAYS) {
      expect(WEEK_MENU[day], day).toHaveLength(4);
      for (const id of WEEK_MENU[day]) expect(RECIPES_BY_ID.has(id), `${day} → ${id}`).toBe(true);
    }
  });

  it("atteint la cible calorique chaque jour", () => {
    for (const day of DAYS) {
      const macros = dayMacros(day, foods);
      expect(macros.kcal, `${day} kcal`).toBeGreaterThan(2300);
      expect(macros.kcal, `${day} kcal`).toBeLessThan(2800);
    }
  });

  it("atteint la cible protéique chaque jour", () => {
    for (const day of DAYS) {
      expect(dayMacros(day, foods).prot, `${day} protéines`).toBeGreaterThanOrEqual(140);
    }
  });

  it("tient une moyenne hebdomadaire cohérente", () => {
    const week = weekMacros(foods);
    expect(week.average.kcal).toBeGreaterThan(2400);
    expect(week.average.kcal).toBeLessThan(2700);
    expect(week.average.prot).toBeGreaterThanOrEqual(145);
  });
});

describe("variante petit-déj liquide", () => {
  it("couvre les sept jours et n'utilise que des recettes connues", () => {
    for (const day of DAYS) {
      expect(WEEK_MENU_LIQUID[day], day).toHaveLength(4);
      for (const id of WEEK_MENU_LIQUID[day]) expect(RECIPES_BY_ID.has(id), `${day} → ${id}`).toBe(true);
    }
  });

  it("commence chaque jour par le petit-déj liquide", () => {
    for (const day of DAYS) expect(WEEK_MENU_LIQUID[day][0], day).toBe("b_huel");
  });

  it("tient les cibles caloriques et protéiques", () => {
    for (const day of DAYS) {
      const macros = dayMacros(day, foods, "match", "liquide");
      expect(macros.kcal, `${day} kcal`).toBeGreaterThan(2300);
      expect(macros.kcal, `${day} kcal`).toBeLessThan(2800);
      expect(macros.prot, `${day} protéines`).toBeGreaterThanOrEqual(140);
    }
  });

  // Le petit-déj liquide coûte légèrement plus cher : Huel revient à 2,72 € la
  // portion contre 1,60 € pour un petit-déj maison. Ce qu'on achète, c'est le
  // temps du matin, pas une économie — l'écart doit rester marginal.
  it("coûte un peu plus cher, sans dérive de budget", () => {
    const normal = weekMacros(foods, "match", "normal");
    const liquide = weekMacros(foods, "match", "liquide");
    const ecartMensuel = (liquide.average.cost - normal.average.cost) * 30.4;
    expect(ecartMensuel).toBeGreaterThan(0);
    expect(ecartMensuel).toBeLessThan(15);
  });

  it("garde des macros comparables", () => {
    const normal = weekMacros(foods, "match", "normal");
    const liquide = weekMacros(foods, "match", "liquide");
    expect(Math.abs(liquide.average.prot - normal.average.prot)).toBeLessThan(12);
    expect(Math.abs(liquide.average.kcal - normal.average.kcal)).toBeLessThan(120);
  });

  it("isole les achats en ligne dans la liste de courses", () => {
    const list = buildShoppingList(foods, "match", "liquide");
    expect(list.totalEnLigne).toBeGreaterThan(0);
    expect(list.items.some((item) => item.enligne)).toBe(true);
    expect(buildShoppingList(foods, "match", "normal").totalEnLigne).toBe(0);
  });

  it("menuFor rend bien la variante demandée", () => {
    expect(menuFor("normal").menu).toBe(WEEK_MENU);
    expect(menuFor("liquide").menu).toBe(WEEK_MENU_LIQUID);
  });
});

describe("liste de courses", () => {
  const list = buildShoppingList(foods);

  it("arrondit au conditionnement, jamais en dessous du besoin", () => {
    for (const item of list.items) {
      const food = foods.get(item.foodId)!;
      expect(item.packs * food.poids, item.nom).toBeGreaterThanOrEqual(item.besoinG);
      expect(item.packs).toBeGreaterThanOrEqual(1);
    }
  });

  it("coûte plus cher en panier qu'en consommation réelle", () => {
    expect(list.totalPanier).toBeGreaterThan(list.totalConsomme);
  });

  it("sépare le placard du réassort", () => {
    expect(list.totalReassort).toBeLessThan(list.totalPanier);
    expect(list.items.some((item) => item.placard)).toBe(true);
  });

  it("projette un budget mensuel dans l'ordre de grandeur attendu", () => {
    expect(list.projectionMensuelle).toBeGreaterThan(250);
    expect(list.projectionMensuelle).toBeLessThan(400);
  });

  it("chiffre l'écart entre enseignes", () => {
    const comparison = compareStores(foods);
    expect(comparison.match).toBeGreaterThan(comparison.auchan);
    expect(comparison.ecart).toBeGreaterThan(0);
  });
});

describe("foodToMeal", () => {
  it("nomme la portion et reporte les macros", () => {
    const skyr = foods.get("skyr")!;
    const meal = foodToMeal(skyr, 200, "meal-2");
    expect(meal.name).toContain("200 g");
    expect(meal.grams).toBe(200);
    expect(meal.proteinG).toBe(Math.round(skyr.prot * 2));
  });
});
