"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Utensils } from "lucide-react";
import {
  foodToMeal,
  indexFoods,
  loadFoods,
  recipeMacros,
  recipeToMeal,
  RECIPES,
  RECIPES_BY_ID,
  type Food,
  type FoodDatabase,
} from "@/lib/v2/nutrition";
import { MealPlanner } from "./MealPlanner";
import { MealLogList, PortionPicker, RecentMeals, recentMeals } from "./MealLogTools";
import { PantryPanel } from "./PantryPanel";
import { PurchasesPanel } from "./PurchasesPanel";
import { V2_TARGETS } from "@/lib/v2/coachPlan";
import type { DailyLog, MealSlotId } from "@/lib/v2/types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

let counter = 0;
function makeId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

function MacroLine({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const ratio = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="metric-row">
      <div className="metric-row__label">
        <span>{label}</span>
        <strong>
          {value} / {target} {unit}
        </strong>
      </div>
      <div className="metric-track" aria-hidden="true">
        <span style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function QuickAdd({
  foods,
  onAdd,
}: {
  foods: Map<string, Food>;
  onAdd: (foodId: string, grams: number) => void;
}) {
  const [foodId, setFoodId] = useState("");
  const [grams, setGrams] = useState("100");
  const list = useMemo(() => Array.from(foods.values()).sort((a, b) => a.nom.localeCompare(b.nom)), [foods]);
  const selected = foodId ? foods.get(foodId) : undefined;
  const quantity = Number(grams.replace(",", ".")) || 0;
  const preview = selected && quantity > 0 ? {
    kcal: Math.round((selected.kcal * quantity) / 100),
    prot: Math.round((selected.prot * quantity) / 100),
  } : null;

  return (
    <div className="form-grid">
      <label className="field field--wide">
        <span>Aliment</span>
        <select value={foodId} onChange={(event) => setFoodId(event.target.value)}>
          <option value="">Choisir…</option>
          {list.map((food) => (
            <option key={food.id} value={food.id}>
              {food.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Quantité</span>
        <div className="input-with-suffix">
          <input inputMode="numeric" value={grams} onChange={(event) => setGrams(event.target.value)} />
          <em>g</em>
        </div>
      </label>
      <button
        type="button"
        className="primary-button"
        disabled={!selected || quantity <= 0}
        onClick={() => selected && onAdd(selected.id, quantity)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Ajouter
      </button>
      {preview ? (
        <p className="muted field--wide">
          {preview.kcal} kcal · {preview.prot} g de protéines
        </p>
      ) : null}
    </div>
  );
}

/** Repas hors base : on colle directement les kcal et protéines estimés. */
function FreeMeal({ onAdd }: { onAdd: (name: string, kcal: number, protein: number) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const k = Number(kcal.replace(",", "."));
  const p = Number(protein.replace(",", "."));
  const valid = name.trim() && Number.isFinite(k) && k > 0 && Number.isFinite(p) && p >= 0;

  return (
    <div className="form-grid">
      <label className="field field--wide">
        <span>Repas</span>
        <input value={name} placeholder="Pâtes tomate, œufs, emmental" onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Calories</span>
        <div className="input-with-suffix">
          <input inputMode="numeric" value={kcal} onChange={(event) => setKcal(event.target.value)} />
          <em>kcal</em>
        </div>
      </label>
      <label className="field">
        <span>Protéines</span>
        <div className="input-with-suffix">
          <input inputMode="numeric" value={protein} onChange={(event) => setProtein(event.target.value)} />
          <em>g</em>
        </div>
      </label>
      <button
        type="button"
        className="primary-button"
        disabled={!valid}
        onClick={() => {
          onAdd(name.trim(), Math.round(k), Math.round(p));
          setName("");
          setKcal("");
          setProtein("");
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Noter
      </button>
    </div>
  );
}

/** Repas qu'on peut marquer comme sautés, pour ne pas confondre « rien mangé » et « oublié de noter ». */
const SKIPPABLE: { id: MealSlotId; label: string }[] = [
  { id: "petit_dej", label: "Petit-déj" },
  { id: "dejeuner", label: "Déjeuner" },
  { id: "diner", label: "Dîner" },
];

export function NutritionTab({
  today,
  logs,
  updateToday,
}: {
  today: DailyLog;
  logs: DailyLog[];
  updateToday: (log: DailyLog) => void;
}) {
  const [portion, setPortion] = useState(1);
  const [db, setDb] = useState<FoodDatabase | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadFoods().then(setDb).catch(() => setError(true));
  }, []);

  const foods = useMemo(() => (db ? indexFoods(db) : new Map<string, Food>()), [db]);
  const consumed = today.meals.reduce(
    (total, meal) => ({ kcal: total.kcal + meal.calories, prot: total.prot + meal.proteinG }),
    { kcal: 0, prot: 0 },
  );

  // Recettes déjà consignées aujourd'hui : le plan compte quatre repas, et rien
  // n'empêchait jusqu'ici de cliquer deux fois sur le même.
  const loggedRecipeIds = new Set(today.meals.map((meal) => meal.sourceId).filter(Boolean) as string[]);

  function addRecipe(recipeId: string) {
    const recipe = RECIPES_BY_ID.get(recipeId);
    if (!recipe) return;
    updateToday({ ...today, meals: [...today.meals, recipeToMeal(recipe, foods, makeId("meal"), portion)] });
    setPortion(1);
  }

  /** Retire la dernière occurrence d'une recette : un clic de trop se répare. */
  function removeRecipe(recipeId: string) {
    const index = today.meals.map((meal) => meal.sourceId).lastIndexOf(recipeId);
    if (index === -1) return;
    updateToday({ ...today, meals: today.meals.filter((_, position) => position !== index) });
  }

  function addFood(foodId: string, grams: number) {
    const food = foods.get(foodId);
    if (!food) return;
    updateToday({ ...today, meals: [...today.meals, foodToMeal(food, grams, makeId("meal"))] });
  }

  if (error) {
    return (
      <div className="tab-grid">
        <section className="panel">
          <p className="muted">
            Base d&apos;aliments indisponible : <code>public/data/foods.json</code> n&apos;a pas pu être chargé.
          </p>
        </section>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="tab-grid">
        <section className="panel">
          <div className="skeleton-lines">
            <span />
            <span />
            <span />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="tab-grid">
      <section className="panel panel--lead">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Aujourd&apos;hui</span>
            <h2>{consumed.prot} g de protéines</h2>
          </div>
          <Utensils className="panel-icon" aria-hidden="true" />
        </div>
        <div className="metric-list">
          <MacroLine label="Protéines" value={consumed.prot} target={V2_TARGETS.proteinG} unit="g" />
          <MacroLine label="Calories" value={consumed.kcal} target={V2_TARGETS.calories} unit="kcal" />
        </div>

        <h3 className="section-title">Noté aujourd&apos;hui</h3>
        <MealLogList meals={today.meals} onChange={(meals) => updateToday({ ...today, meals })} />

        <div className="chip-row skip-row">
          <span className="chip-row__label">Sauté</span>
          <div className="chip-row__items">
            {SKIPPABLE.map((slot) => {
              const active = today.skippedMeals?.includes(slot.id) ?? false;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={active ? "chip is-active" : "chip"}
                  aria-pressed={active}
                  onClick={() => {
                    const current = today.skippedMeals ?? [];
                    const skippedMeals = active ? current.filter((id) => id !== slot.id) : [...current, slot.id];
                    updateToday({ ...today, skippedMeals });
                  }}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>

        <RecentMeals
          meals={recentMeals(logs, today.date)}
          onRedo={(meal) => updateToday({ ...today, meals: [...today.meals, meal] })}
        />

        <h3 className="section-title">Repas du plan</h3>
        <PortionPicker value={portion} onChange={setPortion} />
        <div className="quick-grid">
          {RECIPES.map((recipe) => {
            const macros = recipeMacros(recipe, foods);
            const logged = loggedRecipeIds.has(recipe.id);
            return (
              <button
                key={recipe.id}
                type="button"
                className={cx("quick-button", logged && "is-logged")}
                onClick={() => (logged ? removeRecipe(recipe.id) : addRecipe(recipe.id))}
                aria-label={logged ? `Retirer ${recipe.nom} (noté par erreur)` : `Ajouter ${recipe.nom}`}
              >
                {logged ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                <span>
                  {recipe.nom}
                  <em className="quick-button__meta">
                    {logged ? "mangé · toucher pour annuler · " : ""}
                    {Math.round(macros.prot * (logged ? 1 : portion))} g · {Math.round(macros.kcal * (logged ? 1 : portion))} kcal · {recipe.minutes} min
                  </em>
                </span>
              </button>
            );
          })}
        </div>

        <h3 className="section-title">Ou un aliment à la portion</h3>
        <QuickAdd foods={foods} onAdd={addFood} />

        <h3 className="section-title">Ou un repas libre (valeurs estimées)</h3>
        <FreeMeal
          onAdd={(name, calories, proteinG) =>
            updateToday({
              ...today,
              meals: [...today.meals, { id: makeId("meal"), name, calories, proteinG, quality: "improvise" }],
            })
          }
        />

      </section>

      <PantryPanel foods={foods} onCook={addRecipe} />
      <MealPlanner foods={foods} loggedRecipeIds={loggedRecipeIds} onEat={addRecipe} onUneat={removeRecipe} />
      <PurchasesPanel />
    </div>
  );
}
