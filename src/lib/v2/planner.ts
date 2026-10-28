/**
 * Générateur de menu de la semaine.
 *
 * Même logique qu'un planificateur de repas grand public : on choisit son
 * magasin, son budget et ses préférences, l'app compose le menu de la semaine
 * et la liste de courses correspondante, triée par rayon et arrondie au
 * conditionnement pour limiter le gaspillage. Chaque repas peut être échangé et
 * la semaine entière régénérée.
 *
 * La génération est déterministe pour une graine donnée : on tire plusieurs
 * centaines de semaines candidates et on garde la mieux notée (budget, restes,
 * protéines, calories, variété).
 */

import { V2_TARGETS } from "./coachPlan";
import {
  DAYS,
  foodMacros,
  priceOf,
  RECIPES,
  RECIPES_BY_ID,
  sumMacros,
  type Day,
  type Food,
  type Macros,
  type Recipe,
  type RecipeItem,
  type Store,
} from "./nutrition";

export type MealSlot = Recipe["type"];

export const SLOTS: { id: MealSlot; label: string }[] = [
  { id: "petit_dej", label: "Petit-déj" },
  { id: "dejeuner", label: "Déjeuner" },
  { id: "collation", label: "Collation" },
  { id: "diner", label: "Dîner" },
];

/** Préférences alimentaires : on exclut une famille d'aliments entière. */
export const EXCLUSIONS = {
  poisson: { label: "Poisson", foods: ["thon_naturel", "saumon_frais"] },
  oeufs: { label: "Œufs", foods: ["oeufs"] },
  laitiers: {
    label: "Produits laitiers",
    foods: ["fromage_blanc", "lait_demi_ecreme", "emmental_rape", "skyr", "yaourt_grec"],
  },
  boeuf: { label: "Bœuf", foods: ["boeuf_hache_5"] },
  poulet: { label: "Poulet", foods: ["poulet_filet"] },
  legumineuses: { label: "Légumineuses", foods: ["lentilles", "pois_chiches"] },
  en_ligne: { label: "Huel / whey", foods: ["huel_essential", "whey"] },
} as const;

export type ExclusionId = keyof typeof EXCLUSIONS;

// ---------------------------------------------------------------------------
// Magasins
// ---------------------------------------------------------------------------

export type ShopId = "aldi_linandes" | "auchan_3f" | "match_vda";

export type Shop = {
  id: ShopId;
  label: string;
  city: "Cergy" | "Lille";
  /** Accès depuis le logement, en clair. Distances approximatives. */
  access: string;
  /** Minutes à pied, approximatives : au-delà de 10, le poids compte. */
  walkMin: number;
  /** Base de prix utilisée (seules Auchan et Match ont des prix relevés). */
  prices: Store;
  estimatedPrices: boolean;
};

export const SHOPS: Shop[] = [
  {
    id: "aldi_linandes",
    label: "Aldi · quartier",
    city: "Cergy",
    access: "Le plus proche — quelques minutes à pied",
    walkMin: 5,
    prices: "aldi",
    estimatedPrices: true,
  },
  {
    id: "auchan_3f",
    label: "Auchan · 3 Fontaines",
    city: "Cergy",
    access: "≈ 15-20 min à pied, ou en bus",
    walkMin: 18,
    prices: "auchan",
    estimatedPrices: false,
  },
  {
    id: "match_vda",
    label: "Match · Lille",
    city: "Lille",
    access: "Quand tu es à Lille",
    walkMin: 10,
    prices: "match",
    estimatedPrices: false,
  },
];

export const SHOPS_BY_ID = new Map(SHOPS.map((shop) => [shop.id, shop]));

export function shopOf(prefs: PlannerPrefs): Shop {
  return SHOPS_BY_ID.get(prefs.shop) ?? SHOPS[0];
}

export type PlannerPrefs = {
  /** Magasin choisi. */
  shop: ShopId;
  /** Base de prix, déduite du magasin. */
  store: Store;
  /** 1 = tout d'un coup ; 2 = début de semaine puis milieu de semaine (plus léger, plus frais). */
  trips: 1 | 2;
  /** Poids maximal que tu acceptes de porter par course, en kg. */
  maxCarryKg: number;
  /** Budget courses de la semaine, en euros. */
  budgetWeek: number;
  /** 5 = du lundi au vendredi, 7 = toute la semaine. */
  days: 5 | 7;
  slots: MealSlot[];
  /** Temps de préparation maximal par repas, en minutes. */
  maxMinutes: number;
  excluded: ExclusionId[];
};

export const DEFAULT_PREFS: PlannerPrefs = {
  shop: "aldi_linandes",
  store: "auchan",
  trips: 2,
  maxCarryKg: 8,
  budgetWeek: 70,
  days: 7,
  slots: ["petit_dej", "dejeuner", "collation", "diner"],
  maxMinutes: 20,
  excluded: ["en_ligne"],
};

export type PlannedDay = {
  day: Day;
  /** Identifiants de recettes, dans l'ordre des créneaux. */
  meals: string[];
  /** Portion de féculent ajoutée pour atteindre la cible calorique. */
  extras: RecipeItem[];
};

export type WeekPlan = {
  createdAt: string;
  seed: number;
  prefs: PlannerPrefs;
  days: PlannedDay[];
};

// ---------------------------------------------------------------------------
// Aléatoire reproductible
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

// ---------------------------------------------------------------------------
// Candidats
// ---------------------------------------------------------------------------

function excludedFoods(prefs: PlannerPrefs) {
  return new Set<string>(prefs.excluded.flatMap((id) => [...EXCLUSIONS[id].foods]));
}

/** Recettes compatibles avec les préférences, pour un créneau. */
export function candidatesFor(slot: MealSlot, prefs: PlannerPrefs): Recipe[] {
  const banned = excludedFoods(prefs);
  return RECIPES.filter(
    (recipe) =>
      recipe.type === slot &&
      recipe.minutes <= prefs.maxMinutes &&
      recipe.items.every((item) => !banned.has(item.foodId)),
  );
}

function orderedSlots(prefs: PlannerPrefs): MealSlot[] {
  return SLOTS.map((slot) => slot.id).filter((id) => prefs.slots.includes(id));
}

export function planDays(prefs: PlannerPrefs): Day[] {
  return DAYS.slice(0, prefs.days) as Day[];
}

/** Le plan couvre-t-il toute la journée ? Sinon, pas de cible calorique à viser. */
export function coversFullDay(prefs: PlannerPrefs) {
  return SLOTS.every((slot) => prefs.slots.includes(slot.id));
}

// ---------------------------------------------------------------------------
// Macros et accompagnement
// ---------------------------------------------------------------------------

function itemsMacros(items: RecipeItem[], foods: Map<string, Food>, store: Store): Macros {
  return sumMacros(
    items
      .map((item) => {
        const food = foods.get(item.foodId);
        return food ? foodMacros(food, item.grams, store) : null;
      })
      .filter((item): item is Macros => item !== null),
  );
}

export function dayItems(day: PlannedDay): RecipeItem[] {
  return [
    ...day.meals.flatMap((id) => RECIPES_BY_ID.get(id)?.items ?? []),
    ...day.extras,
  ];
}

export function plannedDayMacros(day: PlannedDay, foods: Map<string, Food>, store: Store): Macros {
  return itemsMacros(dayItems(day), foods, store);
}

/**
 * Complète la journée avec du riz (ou du pain si le riz manque) pour approcher
 * la cible calorique, seulement quand le plan couvre les quatre repas.
 */
function fillExtras(meals: string[], foods: Map<string, Food>, prefs: PlannerPrefs): RecipeItem[] {
  if (!coversFullDay(prefs)) return [];
  const base = itemsMacros(
    meals.flatMap((id) => RECIPES_BY_ID.get(id)?.items ?? []),
    foods,
    prefs.store,
  );
  const deficit = V2_TARGETS.calories - base.kcal;
  if (deficit < 80) return [];
  const starch = foods.get("riz_basmati") ?? foods.get("pain_complet");
  if (!starch || starch.kcal <= 0) return [];
  const grams = Math.min(150, Math.round(((deficit / starch.kcal) * 100) / 10) * 10);
  return grams > 0 ? [{ foodId: starch.id, grams }] : [];
}

function makeDay(day: Day, meals: string[], foods: Map<string, Food>, prefs: PlannerPrefs): PlannedDay {
  return { day, meals, extras: fillExtras(meals, foods, prefs) };
}

// ---------------------------------------------------------------------------
// Liste de courses — triée par rayon
// ---------------------------------------------------------------------------

/** Ordre de passage en magasin. */
export const AISLES: { id: string; label: string; cats: string[] }[] = [
  { id: "frais_vegetal", label: "Fruits & légumes", cats: ["fruits", "legumes"] },
  { id: "boucherie", label: "Boucherie · poissonnerie · œufs", cats: ["proteines"] },
  { id: "cremerie", label: "Crèmerie", cats: ["produits_laitiers"] },
  { id: "epicerie", label: "Épicerie", cats: ["feculents", "epicerie", "matieres_grasses", "snacks_sains"] },
  { id: "en_ligne", label: "Commande en ligne", cats: ["en_ligne"] },
];

export function aisleOf(cat: string) {
  return AISLES.find((aisle) => aisle.cats.includes(cat)) ?? AISLES[3];
}

/**
 * Fruits et légumes achetés à la pièce (vrac) : on ne prend que ce qu'il faut,
 * au lieu du kilo entier. Poids moyen d'une pièce, en grammes.
 */
export const VRAC_UNIT_G: Record<string, { g: number; singulier: string; pluriel: string }> = {
  tomate: { g: 120, singulier: "tomate", pluriel: "tomates" },
  poivron: { g: 180, singulier: "poivron", pluriel: "poivrons" },
  aubergine: { g: 300, singulier: "aubergine", pluriel: "aubergines" },
  courgette: { g: 250, singulier: "courgette", pluriel: "courgettes" },
  oignon: { g: 120, singulier: "oignon", pluriel: "oignons" },
  banane: { g: 120, singulier: "banane", pluriel: "bananes" },
  pomme: { g: 180, singulier: "pomme", pluriel: "pommes" },
  patate_douce: { g: 300, singulier: "patate douce", pluriel: "patates douces" },
};

export type PlanShoppingItem = {
  foodId: string;
  nom: string;
  aisle: string;
  besoinG: number;
  packs: number;
  unite: string;
  /** Prix payé en caisse. */
  cout: number;
  /** Poids à porter, en kg. */
  poidsKg: number;
  /** Quantité achetée, en grammes (ajoutée au frigo quand l'article est coché). */
  achatG: number;
  /** Libellé prêt à afficher : « 3 tomates » ou « 2 × Riz basmati (1 kg) ». */
  quantite: string;
  vrac: boolean;
  placard: boolean;
  enligne: boolean;
};

export type PlanShopping = {
  items: PlanShoppingItem[];
  /** À payer en caisse cette semaine (conditionnements entiers). */
  totalPanier: number;
  /** Valeur réellement consommée sur la semaine. */
  totalConsomme: number;
  /** Valeur des produits frais achetés mais non utilisés. */
  restes: number;
  /** Poids total à porter, en kg. */
  poidsKg: number;
};

/** Jours couverts par une course (index dans `plan.days`). */
export function tripDays(plan: WeekPlan, trip: number): number[] {
  const all = plan.days.map((_, index) => index);
  if (plan.prefs.trips === 1) return all;
  const split = Math.min(3, Math.ceil(all.length / 2));
  return trip === 0 ? all.slice(0, split) : all.slice(split);
}

export function tripLabel(plan: WeekPlan, trip: number) {
  const days = tripDays(plan, trip).map((index) => plan.days[index].day);
  if (!days.length) return "";
  const range = days.length > 1 ? `${days[0].slice(0, 3).toLowerCase()} → ${days[days.length - 1].slice(0, 3).toLowerCase()}` : days[0].toLowerCase();
  if (plan.prefs.trips === 1) return `Courses de la semaine (${range})`;
  return trip === 0 ? `Course 1 · ${range} + placard` : `Course 2 · ${range}`;
}

/**
 * Liste de courses d'une course donnée (ou de la semaine si `trip` est omis).
 * Les denrées de placard s'achètent entièrement à la première course.
 */
export function planShopping(plan: WeekPlan, foods: Map<string, Food>, trip?: number): PlanShopping {
  const store = plan.prefs.store;
  const needs = new Map<string, number>();
  const trips = trip == null ? (plan.prefs.trips === 2 ? [0, 1] : [0]) : [trip];

  if (trip == null && trips.length === 2) {
    // Semaine complète en deux courses : on agrège les deux listes.
    const lists = trips.map((index) => planShopping(plan, foods, index));
    const merged = new Map<string, PlanShoppingItem>();
    for (const list of lists) {
      for (const item of list.items) {
        const existing = merged.get(item.foodId);
        merged.set(
          item.foodId,
          existing
            ? { ...existing, achatG: existing.achatG + item.achatG, besoinG: existing.besoinG + item.besoinG, packs: existing.packs + item.packs, cout: Math.round((existing.cout + item.cout) * 100) / 100, poidsKg: Math.round((existing.poidsKg + item.poidsKg) * 10) / 10 }
            : item,
        );
      }
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      items: sortItems([...merged.values()]),
      totalPanier: round(lists.reduce((sum, list) => sum + list.totalPanier, 0)),
      totalConsomme: round(lists.reduce((sum, list) => sum + list.totalConsomme, 0)),
      restes: round(lists.reduce((sum, list) => sum + list.restes, 0)),
      poidsKg: Math.round(lists.reduce((sum, list) => sum + list.poidsKg, 0) * 10) / 10,
    };
  }

  const current = trips[0];
  const days = new Set(tripDays(plan, current));
  plan.days.forEach((day, index) => {
    for (const item of dayItems(day)) {
      const food = foods.get(item.foodId);
      if (!food) continue;
      const counted = food.placard ? current === 0 : days.has(index);
      if (counted) needs.set(item.foodId, (needs.get(item.foodId) ?? 0) + item.grams);
    }
  });

  const items: PlanShoppingItem[] = [];
  let totalPanier = 0;
  let totalConsomme = 0;
  let restes = 0;
  let poids = 0;
  for (const [foodId, besoinG] of needs) {
    const food = foods.get(foodId);
    if (!food) continue;
    const price = priceOf(food, store);
    const unit = VRAC_UNIT_G[foodId];
    const packs = unit
      ? Math.max(1, Math.ceil(besoinG / unit.g - 0.2))
      : Math.max(1, Math.ceil(besoinG / food.poids - 1e-9));
    const achatG = unit ? Math.max(besoinG, packs * unit.g) : packs * food.poids;
    const cout = Math.round(((price * achatG) / food.poids) * 100) / 100;
    const poidsKg = food.enligne ? 0 : Math.round((achatG / 1000) * 10) / 10;
    totalPanier += cout;
    totalConsomme += (price * besoinG) / food.poids;
    poids += poidsKg;
    if (!food.placard) restes += ((achatG - besoinG) / food.poids) * price;
    items.push({
      quantite: unit
        ? `${packs} ${packs > 1 ? unit.pluriel : unit.singulier} (≈ ${Math.round(achatG / 10) * 10} g)`
        : `${packs} × ${food.nom}`,
      vrac: Boolean(unit),
      achatG: Math.round(achatG),
      foodId,
      nom: food.nom,
      aisle: aisleOf(food.cat).id,
      besoinG: Math.round(besoinG),
      packs,
      unite: food.unite,
      cout,
      poidsKg,
      placard: food.placard,
      enligne: food.enligne,
    });
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    items: sortItems(items),
    totalPanier: round(totalPanier),
    totalConsomme: round(totalConsomme),
    restes: round(restes),
    poidsKg: Math.round(poids * 10) / 10,
  };
}

function sortItems(items: PlanShoppingItem[]) {
  const order = AISLES.map((aisle) => aisle.id);
  return items.sort((a, b) =>
    a.aisle === b.aisle ? a.nom.localeCompare(b.nom) : order.indexOf(a.aisle) - order.indexOf(b.aisle),
  );
}

/** Poids de chaque course, en kg (commande en ligne exclue). */
export function tripWeights(plan: WeekPlan, foods: Map<string, Food>): number[] {
  const count = plan.prefs.trips === 2 ? 2 : 1;
  return Array.from({ length: count }, (_, trip) => planShopping(plan, foods, trip).poidsKg);
}

/** Article lourd : un conditionnement d'au moins 1 kg. */
export function isHeavy(item: PlanShoppingItem) {
  return !item.enligne && !item.vrac && item.poidsKg / item.packs >= 1;
}

/**
 * Budget de la semaine : ce qui sort réellement du porte-monnaie en régime de
 * croisière. Les denrées de placard et la commande en ligne sont comptées au
 * prorata de ce qu'on consomme, le frais au conditionnement entier.
 */
export function weeklyBudgetCost(plan: WeekPlan, foods: Map<string, Food>) {
  const shopping = planShopping(plan, foods);
  let cost = 0;
  for (const item of shopping.items) {
    const food = foods.get(item.foodId);
    if (!food) continue;
    cost += food.placard ? (priceOf(food, plan.prefs.store) * item.besoinG) / food.poids : item.cout;
  }
  return Math.round(cost * 100) / 100;
}

export function planPrepMinutes(plan: WeekPlan) {
  return plan.days.reduce(
    (total, day) => total + day.meals.reduce((sum, id) => sum + (RECIPES_BY_ID.get(id)?.minutes ?? 0), 0),
    0,
  );
}

export function plannedMealCount(plan: WeekPlan) {
  return plan.days.reduce((total, day) => total + day.meals.length, 0);
}

// ---------------------------------------------------------------------------
// Notation d'une semaine candidate
// ---------------------------------------------------------------------------

const MAIN_PROTEINS = ["poulet_filet", "boeuf_hache_5", "thon_naturel", "saumon_frais", "oeufs", "lentilles", "pois_chiches"];

function mainProtein(recipeId: string) {
  const recipe = RECIPES_BY_ID.get(recipeId);
  return recipe?.items.find((item) => MAIN_PROTEINS.includes(item.foodId))?.foodId;
}

export function scorePlan(plan: WeekPlan, foods: Map<string, Food>) {
  const prefs = plan.prefs;
  const shopping = planShopping(plan, foods);
  const budget = weeklyBudgetCost(plan, foods);
  let score = 0;

  score += Math.max(0, budget - prefs.budgetWeek) * 6;

  // À pied, chaque kilo au-delà de la limite pèse — surtout si le magasin est loin.
  const walkFactor = shopOf(prefs).walkMin >= 10 ? 2 : 0.8;
  for (const weight of tripWeights(plan, foods)) score += Math.max(0, weight - prefs.maxCarryKg) * walkFactor;
  score += shopping.restes * 1.5;
  score += budget * 0.15;

  if (coversFullDay(prefs)) {
    for (const day of plan.days) {
      const macros = plannedDayMacros(day, foods, prefs.store);
      score += Math.max(0, V2_TARGETS.proteinG - macros.prot) * 0.08;
      score += Math.abs(V2_TARGETS.calories - macros.kcal) / 250;
    }
  }

  // Variété : pas le même plat principal deux jours de suite, ni plus de deux
  // fois par semaine ; pas la même protéine au déjeuner et au dîner.
  const counts = new Map<string, number>();
  plan.days.forEach((day, index) => {
    const previous = plan.days[index - 1];
    const mains = day.meals.filter((id) => {
      const type = RECIPES_BY_ID.get(id)?.type;
      return type === "dejeuner" || type === "diner";
    });
    for (const id of mains) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (previous?.meals.includes(id)) score += 2;
    }
    const proteins = mains.map(mainProtein).filter(Boolean);
    if (proteins.length === 2 && proteins[0] === proteins[1]) score += 2.5;
  });
  for (const count of counts.values()) if (count > 2) score += (count - 2) * 3;

  return score;
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export type GenerationIssue = { slot: MealSlot; label: string };

/** Créneaux demandés pour lesquels aucune recette ne respecte les préférences. */
export function unfillableSlots(prefs: PlannerPrefs): GenerationIssue[] {
  return SLOTS.filter((slot) => prefs.slots.includes(slot.id) && !candidatesFor(slot.id, prefs).length).map(
    (slot) => ({ slot: slot.id, label: slot.label }),
  );
}

export function generatePlan(
  prefs: PlannerPrefs,
  foods: Map<string, Food>,
  seed: number = newSeed(),
  attempts = 400,
): WeekPlan {
  const random = mulberry32(seed);
  const slots = orderedSlots(prefs);
  const pools = new Map(slots.map((slot) => [slot, candidatesFor(slot, prefs)]));
  const days = planDays(prefs);

  let best: WeekPlan | null = null as WeekPlan | null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate: WeekPlan = {
      createdAt: new Date().toISOString(),
      seed,
      prefs,
      days: days.map((day) => {
        const meals = slots
          .map((slot) => {
            const pool = pools.get(slot) ?? [];
            return pool.length ? pool[Math.floor(random() * pool.length)].id : null;
          })
          .filter((id): id is string => Boolean(id));
        return makeDay(day, meals, foods, prefs);
      }),
    };
    const score = scorePlan(candidate, foods);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (!best) throw new Error("Génération impossible");

  // Affinage : on essaie chaque recette possible à chaque créneau et on garde
  // toute amélioration. Deux passes suffisent à éliminer l'essentiel des restes.
  for (let pass = 0; pass < 2; pass += 1) {
    let improved = false;
    for (let dayIndex = 0; dayIndex < best.days.length; dayIndex += 1) {
      for (let mealIndex = 0; mealIndex < best.days[dayIndex].meals.length; mealIndex += 1) {
        const current = RECIPES_BY_ID.get(best.days[dayIndex].meals[mealIndex]);
        if (!current) continue;
        for (const option of pools.get(current.type) ?? []) {
          if (option.id === current.id) continue;
          const trial = replaceMeal(best, dayIndex, mealIndex, option.id, foods);
          const score = scorePlan(trial, foods);
          if (score < bestScore - 1e-6) {
            best = trial;
            bestScore = score;
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

function replaceMeal(plan: WeekPlan, dayIndex: number, mealIndex: number, recipeId: string, foods: Map<string, Food>) {
  const day = plan.days[dayIndex];
  const meals = day.meals.map((id, index) => (index === mealIndex ? recipeId : id));
  return {
    ...plan,
    days: plan.days.map((item, index) => (index === dayIndex ? makeDay(item.day, meals, foods, plan.prefs) : item)),
  };
}

/** Remplace un repas par une autre recette du même créneau. */
export function swapMeal(plan: WeekPlan, dayIndex: number, mealIndex: number, foods: Map<string, Food>, seed = newSeed()) {
  const day = plan.days[dayIndex];
  const current = day ? RECIPES_BY_ID.get(day.meals[mealIndex]) : undefined;
  if (!day || !current) return plan;
  const pool = candidatesFor(current.type, plan.prefs).filter((recipe) => recipe.id !== current.id);
  if (!pool.length) return plan;
  const random = mulberry32(seed);
  const next = pool[Math.floor(random() * pool.length)];
  return replaceMeal(plan, dayIndex, mealIndex, next.id, foods);
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

export const PLANNER_KEY = "coach.v2.mealplan";

export type PlannerStore = {
  prefs: PlannerPrefs;
  plan: WeekPlan | null;
  /** Articles cochés dans la liste de courses. */
  checked: string[];
  /** Changements de menu demandés dans le chat, déjà appliqués. */
  appliedSeeds?: string[];
};

/**
 * Changements de menu demandés dans le chat. Appliqués une fois, et seulement
 * jusqu'à `until` : passé ce jour, le menu de la semaine a pu être régénéré.
 */
export const SEEDED_PLAN_CHANGES: { seedId: string; day: Day; slot: MealSlot; recipeId: string; until: string }[] = [
  { seedId: "plan-2026-10-01-dejeuner", day: "Jeudi", slot: "dejeuner", recipeId: "l_steak_riz", until: "2026-10-01" },
  // Fin de semaine du 01/10 : jambes jeudi soir, haut du corps vendredi, aviron samedi matin, repos dimanche.
  ...([
    ["Jeudi", "collation", "s_fb_miel", "2026-10-01"],
    ["Jeudi", "diner", "d_thon_riz_oeufs", "2026-10-01"],
    ["Vendredi", "petit_dej", "b_fb_miel", "2026-10-02"],
    ["Vendredi", "dejeuner", "l_pates_oeufs", "2026-10-02"],
    ["Vendredi", "collation", "s_lait_banane", "2026-10-02"],
    ["Vendredi", "diner", "d_steak_pates", "2026-10-02"],
    ["Samedi", "petit_dej", "b_fb_miel", "2026-10-03"],
    ["Samedi", "dejeuner", "l_thon_pates", "2026-10-03"],
    ["Samedi", "collation", "s_lait_banane", "2026-10-03"],
    ["Samedi", "diner", "d_omelet", "2026-10-03"],
    ["Dimanche", "petit_dej", "b_oeufs", "2026-10-04"],
    ["Dimanche", "dejeuner", "l_thon_riz", "2026-10-04"],
    ["Dimanche", "collation", "s_fb_miel", "2026-10-04"],
    ["Dimanche", "diner", "d_lentilles_riz", "2026-10-04"],
  ] as const).map(([day, slot, recipeId, until]) => ({
    seedId: `plan-${until}-${slot}-semaine-aviron`,
    day: day as Day,
    slot: slot as MealSlot,
    recipeId,
    until,
  })),
];

export function withSeededPlanChanges(store: PlannerStore, today: string): PlannerStore {
  const applied = new Set(store.appliedSeeds ?? []);
  const pending = SEEDED_PLAN_CHANGES.filter((change) => !applied.has(change.seedId));
  if (!pending.length) return store;
  let plan = store.plan;
  for (const change of pending) {
    if (today <= change.until && plan) {
      plan = {
        ...plan,
        days: plan.days.map((day) =>
          day.day !== change.day
            ? day
            : {
                ...day,
                meals: day.meals.map((id) => (RECIPES_BY_ID.get(id)?.type === change.slot ? change.recipeId : id)),
                // Les recettes imposées sont déjà dosées : pas de féculent ajouté en plus.
                extras: [],
              },
        ),
      };
    }
    applied.add(change.seedId);
  }
  return { ...store, plan, appliedSeeds: [...applied] };
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function loadPlanner(): PlannerStore {
  const fallback: PlannerStore = { prefs: DEFAULT_PREFS, plan: null, checked: [] };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PLANNER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlannerStore>;
    const plan = parsed.plan && Array.isArray(parsed.plan.days)
      && parsed.plan.days.every((day) => day.meals.every((id) => RECIPES_BY_ID.has(id)))
      ? parsed.plan
      : null;
    const prefs = { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) };
    if (!SHOPS_BY_ID.has(prefs.shop)) prefs.shop = DEFAULT_PREFS.shop;
    prefs.store = shopOf(prefs).prices;
    const normalizedPlan = plan
      ? { ...plan, prefs: { ...DEFAULT_PREFS, ...plan.prefs, store: shopOf({ ...DEFAULT_PREFS, ...plan.prefs }).prices } }
      : null;
    const loaded: PlannerStore = {
      prefs,
      plan: normalizedPlan,
      checked: Array.isArray(parsed.checked) ? parsed.checked : [],
      appliedSeeds: Array.isArray(parsed.appliedSeeds) ? parsed.appliedSeeds : [],
    };
    const seeded = withSeededPlanChanges(loaded, todayISO());
    if (seeded !== loaded) savePlanner(seeded);
    return seeded;
  } catch {
    return fallback;
  }
}

export function savePlanner(state: PlannerStore) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLANNER_KEY, JSON.stringify(state));
  } catch {
    // Stockage plein ou indisponible : le menu reste utilisable pour la session.
  }
}
