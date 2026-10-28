/**
 * Nutrition : base d'aliments, recettes, menu de la semaine et liste de courses.
 *
 * La base d'aliments (macros + prix Auchan/Match) vient de la V1
 * (`_archive/legacy-2026-05-17/lib/data/foods.ts`) et vit désormais dans
 * `public/data/foods.json`, chargée à la demande côté client.
 *
 * Les prix sont indicatifs et datent de la construction de l'app : ils servent
 * à arbitrer entre deux paniers, pas à établir un devis.
 */

import type { MealLog } from "./types";

export type Store = "match" | "auchan" | "aldi";

export type Food = {
  id: string;
  nom: string;
  cat: string;
  /** Pour 100 g. */
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
  /** Prix relevés. Aldi : seulement les articles vus sur un ticket, sinon base Auchan. */
  prix: { auchan: number; match: number; aldi?: number };
  unite: string;
  /** Poids du conditionnement, en grammes. */
  poids: number;
  /** Denrée de placard : tient plusieurs semaines, ne se rachète pas chaque semaine. */
  placard: boolean;
  /** Commandé en ligne (Huel, whey) plutôt qu'en magasin — liste de courses séparée. */
  enligne: boolean;
};

export type FoodDatabase = {
  categories: Record<string, string>;
  aliments: Food[];
};

export type RecipeItem = { foodId: string; grams: number };

export type Recipe = {
  id: string;
  nom: string;
  type: "petit_dej" | "dejeuner" | "diner" | "collation";
  /** Temps de préparation en minutes. */
  minutes: number;
  items: RecipeItem[];
  etapes: string[];
};

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

let cache: Promise<FoodDatabase> | null = null;

export function loadFoods(): Promise<FoodDatabase> {
  if (!cache) {
    cache = fetch("/data/foods.json")
      .then((response) => response.json() as Promise<FoodDatabase>)
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}

export function indexFoods(db: FoodDatabase): Map<string, Food> {
  return new Map(db.aliments.map((food) => [food.id, food]));
}

/** Prix d'un conditionnement dans une enseigne (repli sur Auchan si non relevé). */
export function priceOf(food: Food, store: Store): number {
  return food.prix[store] ?? food.prix.auchan;
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

export type Macros = { kcal: number; prot: number; gluc: number; lip: number; cost: number };

export const ZERO_MACROS: Macros = { kcal: 0, prot: 0, gluc: 0, lip: 0, cost: 0 };

/** Macros et coût d'une quantité d'un aliment. */
export function foodMacros(food: Food, grams: number, store: Store = "match"): Macros {
  const ratio = grams / 100;
  return {
    kcal: Math.round(food.kcal * ratio),
    prot: Math.round(food.prot * ratio),
    gluc: Math.round(food.gluc * ratio),
    lip: Math.round(food.lip * ratio),
    cost: Math.round((priceOf(food, store) * grams) / food.poids * 100) / 100,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      prot: total.prot + item.prot,
      gluc: total.gluc + item.gluc,
      lip: total.lip + item.lip,
      cost: Math.round((total.cost + item.cost) * 100) / 100,
    }),
    { ...ZERO_MACROS },
  );
}

export function recipeMacros(recipe: Recipe, foods: Map<string, Food>, store: Store = "match"): Macros {
  return sumMacros(
    recipe.items
      .map((item) => {
        const food = foods.get(item.foodId);
        return food ? foodMacros(food, item.grams, store) : null;
      })
      .filter((item): item is Macros => item !== null),
  );
}

/** Transforme une recette en entrée de journal. */
export function recipeToMeal(recipe: Recipe, foods: Map<string, Food>, id: string, portion = 1): MealLog {
  const macros = recipeMacros(recipe, foods);
  return {
    id,
    name: portion === 1 ? recipe.nom : `${recipe.nom} (×${String(portion).replace(".", ",")})`,
    proteinG: Math.round(macros.prot * portion),
    calories: Math.round(macros.kcal * portion),
    quality: "plan",
    sourceId: recipe.id,
    ...(portion === 1 ? {} : { portion }),
  };
}

/** Transforme une portion d'aliment en entrée de journal. */
export function foodToMeal(food: Food, grams: number, id: string): MealLog {
  const macros = foodMacros(food, grams);
  return {
    id,
    name: `${food.nom.split(" (")[0]} — ${Math.round(grams)} g`,
    proteinG: macros.prot,
    calories: macros.kcal,
    quality: "plan",
    sourceId: food.id,
    grams,
  };
}

// ---------------------------------------------------------------------------
// Recettes — toutes réalisables en 20 minutes maximum, sans porc
// ---------------------------------------------------------------------------

export const RECIPES: Recipe[] = [
  {
    id: "b_fb",
    nom: "Fromage blanc, avoine, banane, beurre de cacahuète",
    type: "petit_dej",
    minutes: 4,
    items: [
      { foodId: "fromage_blanc", grams: 250 },
      { foodId: "flocons_avoine", grams: 50 },
      { foodId: "banane", grams: 120 },
      { foodId: "beurre_cacahuete", grams: 20 },
      { foodId: "miel", grams: 10 },
    ],
    etapes: [
      "Verse le fromage blanc dans un bol.",
      "Ajoute les flocons d'avoine et mélange.",
      "Coupe la banane en rondelles par-dessus.",
      "Termine par le beurre de cacahuète et le miel.",
    ],
  },
  {
    id: "b_oats",
    nom: "Oats protéinés banane",
    type: "petit_dej",
    minutes: 6,
    items: [
      { foodId: "flocons_avoine", grams: 80 },
      { foodId: "lait_demi_ecreme", grams: 250 },
      { foodId: "banane", grams: 120 },
      { foodId: "beurre_cacahuete", grams: 20 },
      { foodId: "fromage_blanc", grams: 150 },
    ],
    etapes: [
      "Casserole à feu moyen : flocons + lait, 3 minutes en remuant jusqu'à épaississement.",
      "Verse dans un bol.",
      "Ajoute le fromage blanc hors du feu, puis la banane et le beurre de cacahuète.",
    ],
  },
  {
    id: "b_oeufs",
    nom: "Œufs brouillés, pain complet, tomate",
    type: "petit_dej",
    minutes: 8,
    items: [
      { foodId: "oeufs", grams: 180 },
      { foodId: "pain_complet", grams: 90 },
      { foodId: "tomate", grams: 100 },
      { foodId: "huile_olive", grams: 8 },
    ],
    etapes: [
      "Casse 3 œufs, bats-les à la fourchette avec une pincée de sel.",
      "Chauffe la poêle à feu moyen avec l'huile.",
      "Verse les œufs, remue en continu jusqu'à texture crémeuse — retire avant qu'ils sèchent.",
      "Sers avec le pain et la tomate en quartiers.",
    ],
  },
  {
    id: "b_huel",
    nom: "Huel Essential — 2 doses",
    type: "petit_dej",
    minutes: 1,
    items: [{ foodId: "huel_essential", grams: 180 }],
    etapes: [
      "La veille : verse 2 doses rases (180 g) dans le shaker, pose-le près de tes clés.",
      "Le matin : 600 ml d'eau froide, secoue 20 secondes, bois.",
      "Rince le shaker tout de suite — sec, il devient impossible à nettoyer.",
    ],
  },
  {
    id: "b_huel_whey",
    nom: "Huel Essential 2 doses + 20 g de whey",
    type: "petit_dej",
    minutes: 1,
    items: [
      { foodId: "huel_essential", grams: 180 },
      { foodId: "whey", grams: 20 },
    ],
    etapes: [
      "Même préparation, la whey va dans le shaker avec le Huel.",
      "La whey compense le profil en acides aminés de la protéine végétale.",
    ],
  },
  {
    id: "l_pates_emmental",
    nom: "Pâtes sauce tomate, emmental",
    type: "dejeuner",
    minutes: 12,
    items: [
      { foodId: "macaronis", grams: 130 },
      { foodId: "sauce_tomate", grams: 170 },
      { foodId: "emmental_rape", grams: 30 },
    ],
    etapes: [
      "Casserole d'eau salée à ébullition, macaronis 7-9 minutes (temps du paquet).",
      "Égoutte, remets dans la casserole avec la sauce tomate, 1 minute à feu doux.",
      "Emmental par-dessus au moment de servir.",
    ],
  },
  {
    id: "l_pates_oeufs",
    nom: "Pâtes sauce tomate, œufs, emmental",
    type: "dejeuner",
    minutes: 14,
    items: [
      { foodId: "macaronis", grams: 120 },
      { foodId: "sauce_tomate", grams: 170 },
      { foodId: "oeufs", grams: 120 },
      { foodId: "emmental_rape", grams: 25 },
      { foodId: "huile_olive", grams: 5 },
    ],
    etapes: [
      "Macaronis 7-9 minutes dans l'eau salée (temps du paquet).",
      "Pendant ce temps, 2 œufs à la poêle (au plat ou brouillés), 1 cuillère à café d'huile suffit.",
      "Mélange pâtes, sauce tomate et œufs, emmental par-dessus.",
    ],
  },
  {
    id: "l_poulet",
    nom: "Poulet, riz, courgettes",
    type: "dejeuner",
    minutes: 20,
    items: [
      { foodId: "poulet_filet", grams: 160 },
      { foodId: "riz_basmati", grams: 110 },
      { foodId: "courgette", grams: 200 },
      { foodId: "huile_olive", grams: 12 },
      { foodId: "ail", grams: 5 },
      { foodId: "herbes_provence", grams: 2 },
    ],
    etapes: [
      "Lance le riz dans deux fois son volume d'eau salée, 11 minutes à couvert.",
      "Coupe le poulet en cubes, saisis-le à feu vif 6 à 8 minutes avec l'ail.",
      "Ajoute les courgettes en rondelles, les herbes, 6 minutes de plus.",
      "Mélange le tout avec le riz égoutté.",
    ],
  },
  {
    id: "l_steak_riz",
    nom: "Steaks hachés, riz basmati, poivrons",
    type: "dejeuner",
    minutes: 15,
    items: [
      { foodId: "steak_hache_15", grams: 250 },
      { foodId: "riz_basmati", grams: 80 },
      { foodId: "poivron", grams: 150 },
      { foodId: "oignon", grams: 50 },
      { foodId: "huile_olive", grams: 5 },
      { foodId: "ail", grams: 5 },
    ],
    etapes: [
      "Lance le riz dans une grande casserole d'eau salée bouillante, 11 minutes, puis égoutte.",
      "Pendant ce temps, fais revenir poivron en lanières, oignon et ail 5 minutes à la poêle avec l'huile.",
      "Pousse les légumes sur le côté et cuis les steaks 3 minutes par face. Sale et poivre à la fin.",
      "Sers le tout ; une cuillère de sauce tomate par-dessus si tu veux.",
    ],
  },
  // Recettes faites avec le stock du 01/10 (ticket Auchan + reste de la course Aldi).
  {
    id: "b_fb_miel",
    nom: "Fromage blanc, banane, miel, pain complet",
    type: "petit_dej",
    minutes: 3,
    items: [
      { foodId: "fromage_blanc", grams: 250 },
      { foodId: "banane", grams: 120 },
      { foodId: "miel", grams: 15 },
      { foodId: "pain_complet", grams: 60 },
    ],
    etapes: [
      "Fromage blanc dans un bol, banane en rondelles, filet de miel.",
      "Deux tranches de pain complet à côté.",
      "Avant un effort (aviron, salle), mange-le 1 h 30 à 2 h avant.",
    ],
  },
  {
    id: "l_thon_riz",
    nom: "Riz, thon, poivrons",
    type: "dejeuner",
    minutes: 15,
    items: [
      { foodId: "thon_naturel", grams: 140 },
      { foodId: "riz_basmati", grams: 90 },
      { foodId: "poivron", grams: 150 },
      { foodId: "oignon", grams: 50 },
      { foodId: "huile_olive", grams: 8 },
    ],
    etapes: [
      "Riz 11 minutes dans l'eau salée bouillante, puis égoutte.",
      "Fais revenir poivron et oignon 5 minutes à la poêle avec l'huile.",
      "Ajoute le thon égoutté et le riz, mélange 1 minute sur le feu.",
    ],
  },
  {
    id: "l_thon_pates",
    nom: "Pâtes thon, tomates fraîches, emmental",
    type: "dejeuner",
    minutes: 12,
    items: [
      { foodId: "macaronis", grams: 110 },
      { foodId: "thon_naturel", grams: 140 },
      { foodId: "tomate", grams: 150 },
      { foodId: "oignon", grams: 50 },
      { foodId: "emmental_rape", grams: 20 },
      { foodId: "huile_olive", grams: 5 },
    ],
    etapes: [
      "Macaronis 8 minutes dans l'eau salée bouillante.",
      "Pendant ce temps, fais revenir oignon et tomates en dés 5 minutes à la poêle.",
      "Ajoute le thon égoutté, puis les pâtes égouttées, l'emmental par-dessus.",
    ],
  },
  {
    id: "s_fb_miel",
    nom: "Fromage blanc, banane, miel",
    type: "collation",
    minutes: 2,
    items: [
      { foodId: "fromage_blanc", grams: 250 },
      { foodId: "banane", grams: 120 },
      { foodId: "miel", grams: 10 },
    ],
    etapes: ["Fromage blanc, banane en rondelles, filet de miel.", "Avant la salle : 1 h à 1 h 30 avant la séance."],
  },
  {
    id: "s_lait_banane",
    nom: "Grand verre de lait, banane",
    type: "collation",
    minutes: 1,
    items: [
      { foodId: "lait_demi_ecreme", grams: 300 },
      { foodId: "banane", grams: 120 },
    ],
    etapes: ["Un grand verre de lait (30 cl) et une banane."],
  },
  {
    id: "d_thon_riz_oeufs",
    nom: "Riz, thon, 2 œufs, poivrons",
    type: "diner",
    minutes: 15,
    items: [
      { foodId: "thon_naturel", grams: 140 },
      { foodId: "oeufs", grams: 120 },
      { foodId: "riz_basmati", grams: 80 },
      { foodId: "poivron", grams: 150 },
      { foodId: "huile_olive", grams: 8 },
    ],
    etapes: [
      "Riz 11 minutes dans l'eau salée bouillante ; œufs durs 9 minutes dans la même eau.",
      "Fais revenir le poivron 5 minutes à la poêle avec l'huile, ajoute le thon égoutté.",
      "Sers avec le riz et les œufs écalés. Idéal après une séance : protéines + féculents.",
    ],
  },
  {
    id: "d_steak_pates",
    nom: "Steaks hachés, macaronis sauce tomate",
    type: "diner",
    minutes: 12,
    items: [
      { foodId: "steak_hache_15", grams: 250 },
      { foodId: "macaronis", grams: 90 },
      { foodId: "sauce_tomate", grams: 150 },
    ],
    etapes: [
      "Macaronis 8 minutes dans l'eau salée bouillante.",
      "Steaks 3 minutes par face à la poêle, sans matière grasse.",
      "Coupe-les en morceaux, ajoute la sauce tomate et les pâtes égouttées, mélange 1 minute.",
    ],
  },
  {
    id: "d_lentilles_riz",
    nom: "Lentilles, riz, aubergine, emmental",
    type: "diner",
    minutes: 15,
    items: [
      { foodId: "lentilles_conserve", grams: 265 },
      { foodId: "riz_basmati", grams: 50 },
      { foodId: "aubergine", grams: 200 },
      { foodId: "oignon", grams: 50 },
      { foodId: "emmental_rape", grams: 20 },
      { foodId: "huile_olive", grams: 10 },
    ],
    etapes: [
      "Riz 11 minutes dans l'eau salée bouillante.",
      "Aubergine en dés et oignon 8 minutes à la poêle avec l'huile.",
      "Ajoute les lentilles rincées, 2 minutes pour les chauffer, puis le riz et l'emmental.",
    ],
  },
  {
    id: "l_boeuf",
    nom: "Bolo bœuf 5 %, pâtes complètes",
    type: "dejeuner",
    minutes: 18,
    items: [
      { foodId: "boeuf_hache_5", grams: 180 },
      { foodId: "pates_completes", grams: 130 },
      { foodId: "tomate_concassee", grams: 200 },
      { foodId: "oignon", grams: 60 },
      { foodId: "huile_olive", grams: 12 },
      { foodId: "ail", grams: 5 },
    ],
    etapes: [
      "Fais revenir l'oignon émincé et l'ail 3 minutes dans l'huile.",
      "Ajoute le bœuf, écrase-le à la spatule, 5 minutes.",
      "Verse les tomates concassées, laisse mijoter 8 minutes.",
      "Pendant ce temps, cuis les pâtes al dente.",
    ],
  },
  {
    id: "l_thon",
    nom: "Pâtes thon-tomate express",
    type: "dejeuner",
    minutes: 12,
    items: [
      { foodId: "thon_naturel", grams: 140 },
      { foodId: "pois_chiches", grams: 150 },
      { foodId: "pates_completes", grams: 90 },
      { foodId: "tomate_concassee", grams: 200 },
      { foodId: "oignon", grams: 50 },
      { foodId: "huile_olive", grams: 10 },
    ],
    etapes: [
      "Cuis les pâtes.",
      "Fais revenir l'oignon, ajoute tomates concassées et pois chiches égouttés, 5 minutes.",
      "Ajoute le thon égoutté hors du feu pour qu'il ne se défasse pas.",
      "Mélange avec les pâtes.",
    ],
  },
  {
    id: "l_saumon",
    nom: "Saumon, patate douce, épinards",
    type: "dejeuner",
    minutes: 20,
    items: [
      { foodId: "saumon_frais", grams: 200 },
      { foodId: "patate_douce", grams: 350 },
      { foodId: "epinards_surgeles", grams: 200 },
      { foodId: "huile_olive", grams: 8 },
      { foodId: "ail", grams: 5 },
    ],
    etapes: [
      "Coupe la patate douce en cubes, 12 minutes à l'eau bouillante ou 8 au micro-ondes.",
      "Poêle le saumon côté peau 4 minutes, puis 3 de l'autre côté.",
      "Fais revenir les épinards avec l'ail, 5 minutes.",
    ],
  },
  {
    id: "l_lentil",
    nom: "Lentilles, œufs durs, poivrons",
    type: "dejeuner",
    minutes: 20,
    items: [
      { foodId: "lentilles", grams: 110 },
      { foodId: "oeufs", grams: 120 },
      { foodId: "poivron", grams: 150 },
      { foodId: "oignon", grams: 50 },
      { foodId: "huile_olive", grams: 12 },
      { foodId: "ail", grams: 5 },
    ],
    etapes: [
      "Cuis les lentilles 18 minutes à l'eau non salée.",
      "En parallèle, œufs durs 9 minutes à l'eau bouillante.",
      "Fais revenir poivrons et oignon, mélange aux lentilles égouttées.",
    ],
  },
  {
    id: "d_poulet",
    nom: "Poulet, patate douce, épinards",
    type: "diner",
    minutes: 18,
    items: [
      { foodId: "poulet_filet", grams: 160 },
      { foodId: "patate_douce", grams: 300 },
      { foodId: "epinards_surgeles", grams: 200 },
      { foodId: "huile_olive", grams: 8 },
      { foodId: "ail", grams: 5 },
    ],
    etapes: [
      "Patate douce en cubes, 8 minutes au micro-ondes couverte.",
      "Poulet en cubes saisi à feu vif avec l'ail, 8 minutes.",
      "Épinards à la poêle 5 minutes, tout mélanger.",
    ],
  },
  {
    id: "d_omelet",
    nom: "Omelette 3 œufs, emmental, pain, tomates",
    type: "diner",
    minutes: 10,
    items: [
      { foodId: "oeufs", grams: 180 },
      { foodId: "emmental_rape", grams: 25 },
      { foodId: "pain_complet", grams: 80 },
      { foodId: "tomate", grams: 150 },
      { foodId: "huile_olive", grams: 8 },
    ],
    etapes: [
      "Bats les œufs, sale, poivre.",
      "Poêle chaude et huilée, verse les œufs, laisse prendre 2 minutes.",
      "Ajoute l'emmental, plie l'omelette, 1 minute de plus.",
      "Sers avec le pain et les tomates.",
    ],
  },
  {
    id: "d_pois",
    nom: "Pois chiches sautés, riz, aubergine",
    type: "diner",
    minutes: 18,
    items: [
      { foodId: "pois_chiches", grams: 300 },
      { foodId: "riz_basmati", grams: 50 },
      { foodId: "aubergine", grams: 200 },
      { foodId: "oignon", grams: 50 },
      { foodId: "huile_olive", grams: 12 },
      { foodId: "ail", grams: 5 },
    ],
    etapes: [
      "Lance le riz.",
      "Aubergine en dés, poêle à feu vif 8 minutes avec l'oignon.",
      "Ajoute les pois chiches égouttés et l'ail, 5 minutes, sale bien.",
    ],
  },
  {
    id: "d_boeuf",
    nom: "Bœuf 5 %, riz, poivrons",
    type: "diner",
    minutes: 15,
    items: [
      { foodId: "boeuf_hache_5", grams: 180 },
      { foodId: "riz_basmati", grams: 100 },
      { foodId: "poivron", grams: 200 },
      { foodId: "oignon", grams: 50 },
      { foodId: "huile_olive", grams: 8 },
    ],
    etapes: [
      "Riz en cuisson.",
      "Poivrons et oignon à la poêle 6 minutes.",
      "Ajoute le bœuf, 5 minutes à feu vif, assaisonne.",
    ],
  },
  {
    id: "d_thon",
    nom: "Salade complète thon, pois chiches, pain",
    type: "diner",
    minutes: 8,
    items: [
      { foodId: "thon_naturel", grams: 140 },
      { foodId: "pois_chiches", grams: 200 },
      { foodId: "tomate", grams: 200 },
      { foodId: "poivron", grams: 100 },
      { foodId: "huile_olive", grams: 10 },
      { foodId: "pain_complet", grams: 80 },
    ],
    etapes: [
      "Égoutte thon et pois chiches.",
      "Coupe tomates et poivron, mélange tout.",
      "Assaisonne à l'huile d'olive, sel, poivre. Sers avec le pain.",
    ],
  },
  {
    id: "s_fb",
    nom: "Fromage blanc, amandes, pomme",
    type: "collation",
    minutes: 2,
    items: [
      { foodId: "fromage_blanc", grams: 250 },
      { foodId: "amandes", grams: 20 },
      { foodId: "pomme", grams: 180 },
    ],
    etapes: ["Bol de fromage blanc, amandes concassées dessus, pomme à côté."],
  },
  {
    id: "s_skyr",
    nom: "Skyr, banane, amandes",
    type: "collation",
    minutes: 2,
    items: [
      { foodId: "skyr", grams: 225 },
      { foodId: "banane", grams: 120 },
      { foodId: "amandes", grams: 20 },
    ],
    etapes: ["Skyr, banane en rondelles, amandes."],
  },
  {
    id: "s_choco",
    nom: "Fromage blanc, banane, chocolat noir",
    type: "collation",
    minutes: 2,
    items: [
      { foodId: "fromage_blanc", grams: 250 },
      { foodId: "banane", grams: 100 },
      { foodId: "chocolat_noir_70", grams: 15 },
    ],
    etapes: ["Fromage blanc, banane, deux carrés de chocolat noir."],
  },
];

export const RECIPES_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

// ---------------------------------------------------------------------------
// Menu de la semaine
// ---------------------------------------------------------------------------

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
export type Day = (typeof DAYS)[number];

/** Rotation validée : variée, sans porc, jamais plus de 20 minutes par repas. */
export const WEEK_MENU: Record<Day, string[]> = {
  Lundi: ["b_fb", "l_poulet", "s_fb", "d_omelet"],
  Mardi: ["b_oats", "l_boeuf", "s_choco", "d_poulet"],
  Mercredi: ["b_oeufs", "l_thon", "s_fb", "d_pois"],
  Jeudi: ["b_fb", "l_poulet", "s_skyr", "d_boeuf"],
  Vendredi: ["b_oats", "l_lentil", "s_fb", "d_omelet"],
  Samedi: ["b_oeufs", "l_saumon", "s_choco", "d_thon"],
  Dimanche: ["b_fb", "l_poulet", "s_skyr", "d_omelet"],
};

/**
 * Accompagnement du jour.
 *
 * Les recettes ont des quantités fixes ; les journées ne tombent donc pas
 * spontanément sur la cible calorique. Plutôt que de tordre chaque recette, on ajoute une
 * portion de féculent explicite — visible, facile à ajuster, et honnête : c'est
 * exactement ce qu'on fait en cuisine quand une assiette est un peu légère.
 */
export const WEEK_EXTRAS: Record<Day, RecipeItem[]> = {
  Lundi: [{ foodId: "riz_basmati", grams: 80 }],
  Mardi: [{ foodId: "riz_basmati", grams: 30 }],
  Mercredi: [],
  Jeudi: [{ foodId: "riz_basmati", grams: 60 }],
  Vendredi: [{ foodId: "pain_complet", grams: 60 }],
  Samedi: [{ foodId: "pain_complet", grams: 30 }],
  Dimanche: [{ foodId: "riz_basmati", grams: 70 }],
};

export function extrasMacros(day: Day, foods: Map<string, Food>, store: Store = "match"): Macros {
  return sumMacros(
    WEEK_EXTRAS[day]
      .map((item) => {
        const food = foods.get(item.foodId);
        return food ? foodMacros(food, item.grams, store) : null;
      })
      .filter((item): item is Macros => item !== null),
  );
}

/**
 * Variante « petit-déj liquide ».
 *
 * Le matin est le créneau où le plan casse le plus souvent, et c'est aussi le
 * moins coûteux à automatiser : personne ne partage un repas à 7 h. On remplace
 * donc les trois petits-déjeuners par deux doses de Huel. Le saumon du samedi
 * reste au menu : c'est le seul apport d'oméga-3 de la semaine.
 */
export const WEEK_MENU_LIQUID: Record<Day, string[]> = {
  Lundi: ["b_huel", "l_poulet", "s_fb", "d_omelet"],
  Mardi: ["b_huel", "l_boeuf", "s_choco", "d_poulet"],
  Mercredi: ["b_huel", "l_thon", "s_fb", "d_pois"],
  Jeudi: ["b_huel", "l_poulet", "s_fb", "d_boeuf"],
  Vendredi: ["b_huel", "l_lentil", "s_fb", "d_omelet"],
  Samedi: ["b_huel", "l_saumon", "s_choco", "d_thon"],
  Dimanche: ["b_huel", "l_lentil", "s_fb", "d_omelet"],
};

export const WEEK_EXTRAS_LIQUID: Record<Day, RecipeItem[]> = {
  Lundi: [],
  Mardi: [],
  Mercredi: [],
  Jeudi: [],
  Vendredi: [{ foodId: "pain_complet", grams: 30 }],
  Samedi: [],
  Dimanche: [],
};

export type MenuMode = "normal" | "liquide";

export function menuFor(mode: MenuMode) {
  return mode === "liquide"
    ? { menu: WEEK_MENU_LIQUID, extras: WEEK_EXTRAS_LIQUID }
    : { menu: WEEK_MENU, extras: WEEK_EXTRAS };
}

export function dayMacros(
  day: Day,
  foods: Map<string, Food>,
  store: Store = "match",
  mode: MenuMode = "normal",
): Macros {
  const { menu, extras } = menuFor(mode);
  return sumMacros([
    ...menu[day]
      .map((id) => RECIPES_BY_ID.get(id))
      .filter((recipe): recipe is Recipe => Boolean(recipe))
      .map((recipe) => recipeMacros(recipe, foods, store)),
    sumMacros(
      extras[day]
        .map((item) => {
          const food = foods.get(item.foodId);
          return food ? foodMacros(food, item.grams, store) : null;
        })
        .filter((item): item is Macros => item !== null),
    ),
  ]);
}

export function weekMacros(foods: Map<string, Food>, store: Store = "match", mode: MenuMode = "normal") {
  const days = DAYS.map((day) => dayMacros(day, foods, store, mode));
  const total = sumMacros(days);
  return {
    days,
    total,
    average: {
      kcal: Math.round(total.kcal / 7),
      prot: Math.round(total.prot / 7),
      gluc: Math.round(total.gluc / 7),
      lip: Math.round(total.lip / 7),
      cost: Math.round((total.cost / 7) * 100) / 100,
    } as Macros,
  };
}

// ---------------------------------------------------------------------------
// Liste de courses
// ---------------------------------------------------------------------------

export type ShoppingItem = {
  foodId: string;
  nom: string;
  cat: string;
  /** Quantité réellement nécessaire, en grammes. */
  besoinG: number;
  /** Nombre de conditionnements à acheter. */
  packs: number;
  unite: string;
  cout: number;
  placard: boolean;
  enligne: boolean;
};

export type ShoppingList = {
  items: ShoppingItem[];
  /** Panier complet, placard inclus — le coût de la première semaine. */
  totalPanier: number;
  /** Hors placard : ce que coûtent les semaines suivantes. */
  totalReassort: number;
  /** Denrées réellement consommées, hors sur-conditionnement. */
  totalConsomme: number;
  /** Projection sur 4,33 semaines. */
  projectionMensuelle: number;
  /** Sous-total des articles commandés en ligne (Huel, whey). */
  totalEnLigne: number;
};

/** Agrège le menu de la semaine en liste de courses, arrondie au conditionnement. */
export function buildShoppingList(
  foods: Map<string, Food>,
  store: Store = "match",
  mode: MenuMode = "normal",
): ShoppingList {
  const { menu, extras: dayExtras } = menuFor(mode);
  const needs = new Map<string, number>();
  let consomme = 0;

  function account(item: RecipeItem) {
    const food = foods.get(item.foodId);
    if (!food) return;
    needs.set(item.foodId, (needs.get(item.foodId) ?? 0) + item.grams);
    consomme += (priceOf(food, store) * item.grams) / food.poids;
  }

  for (const day of DAYS) {
    for (const recipeId of menu[day]) {
      const recipe = RECIPES_BY_ID.get(recipeId);
      if (!recipe) continue;
      recipe.items.forEach(account);
    }
    dayExtras[day].forEach(account);
  }

  const items: ShoppingItem[] = [];
  let totalPanier = 0;
  let totalReassort = 0;

  for (const [foodId, besoinG] of needs) {
    const food = foods.get(foodId);
    if (!food) continue;
    const packs = Math.max(1, Math.ceil(besoinG / food.poids - 1e-9));
    const cout = Math.round(packs * priceOf(food, store) * 100) / 100;
    totalPanier += cout;
    if (!food.placard) totalReassort += cout;
    items.push({
      foodId,
      nom: food.nom,
      cat: food.cat,
      besoinG: Math.round(besoinG),
      packs,
      unite: food.unite,
      cout,
      placard: food.placard,
      enligne: food.enligne,
    });
  }

  items.sort((a, b) => (a.cat === b.cat ? b.cout - a.cout : a.cat.localeCompare(b.cat)));

  return {
    items,
    totalPanier: Math.round(totalPanier * 100) / 100,
    totalReassort: Math.round(totalReassort * 100) / 100,
    totalConsomme: Math.round(consomme * 100) / 100,
    projectionMensuelle: Math.round(consomme * 4.33),
    totalEnLigne:
      Math.round(items.filter((item) => foods.get(item.foodId)?.enligne).reduce((sum, item) => sum + item.cout, 0) * 100) /
      100,
  };
}

/** Écart de prix entre les deux enseignes sur un panier donné. */
export function compareStores(foods: Map<string, Food>, mode: MenuMode = "normal") {
  const match = buildShoppingList(foods, "match", mode);
  const auchan = buildShoppingList(foods, "auchan", mode);
  return {
    match: match.totalPanier,
    auchan: auchan.totalPanier,
    ecart: Math.round((match.totalPanier - auchan.totalPanier) * 100) / 100,
  };
}
