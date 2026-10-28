"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Refrigerator, X } from "lucide-react";
import type { Food } from "@/lib/v2/nutrition";
import { adjust, feasibleRecipes, loadPantry, removeFood, savePantry, type Pantry } from "@/lib/v2/pantry";

export function PantryPanel({
  foods,
  onCook,
}: {
  foods: Map<string, Food>;
  onCook: (recipeId: string) => void;
}) {
  const [pantry, setPantry] = useState<Pantry>(() => loadPantry());
  const [foodId, setFoodId] = useState("");
  const [grams, setGrams] = useState("");

  // Les repas notés vident le frigo ailleurs dans l'app : on se resynchronise.
  useEffect(() => {
    const refresh = () => setPantry(loadPantry());
    window.addEventListener("coach:pantry", refresh);
    return () => window.removeEventListener("coach:pantry", refresh);
  }, []);

  function commit(next: Pantry) {
    setPantry(next);
    savePantry(next);
  }

  const stock = Object.entries(pantry)
    .map(([id, value]) => ({ food: foods.get(id), id, value }))
    .filter((item) => item.food)
    .sort((a, b) => (a.food!.cat === b.food!.cat ? a.food!.nom.localeCompare(b.food!.nom) : a.food!.cat.localeCompare(b.food!.cat)));
  const inStock = stock.filter((item) => item.value > 0);
  const empty = stock.filter((item) => item.value <= 0);

  const feasible = useMemo(() => feasibleRecipes(pantry, foods), [pantry, foods]);
  const ready = feasible.filter((item) => !item.missing.length).slice(0, 4);
  const almost = feasible.filter((item) => item.missing.length === 1).slice(0, 3);
  const hasProtein = inStock.some((item) => (item.food?.prot ?? 0) >= 12 && item.value >= 100);
  const list = useMemo(() => Array.from(foods.values()).sort((a, b) => a.nom.localeCompare(b.nom)), [foods]);

  return (
    <section className="panel">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Mon frigo</span>
          <h2>{inStock.length} aliments en stock</h2>
        </div>
        <Refrigerator className="panel-icon" aria-hidden="true" />
      </div>
      <p className="muted">
        Se remplit quand tu coches la liste de courses, se vide quand tu notes un repas. Quantités approximatives :
        corrige-les si besoin.
      </p>

      {!hasProtein ? (
        <p className="coach-line coach-line--warn">
          Plus assez de protéines au frigo pour un repas : skyr, fromage blanc, thon ou poulet au prochain passage.
        </p>
      ) : null}

      <h3 className="section-title">Faisable maintenant</h3>
      {ready.length ? (
        <div className="quick-grid">
          {ready.map(({ recipe }) => (
            <button key={recipe.id} type="button" className="quick-button" onClick={() => onCook(recipe.id)}>
              <Plus aria-hidden="true" />
              <span>
                {recipe.nom}
                <em className="quick-button__meta">tout est au frigo · {recipe.minutes} min · toucher pour noter</em>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Aucune recette complète avec ce que tu as.</p>
      )}
      {almost.length ? (
        <ul className="log-list">
          {almost.map(({ recipe, missing }) => (
            <li key={recipe.id}>
              <span>{recipe.nom}</span>
              <strong className="muted">manque : {missing.join(", ")}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="section-title">En stock</h3>
      <ul className="pantry-list">
        {inStock.map(({ food, id, value }) => (
          <li key={id}>
            <span>{food!.nom.split(" (")[0]}</span>
            <label className="pantry-list__qty">
              <input
                inputMode="numeric"
                defaultValue={value}
                key={`${id}-${value}`}
                aria-label={`Quantité de ${food!.nom}`}
                onBlur={(event) => {
                  const next = Number(event.target.value.replace(",", "."));
                  if (Number.isFinite(next) && next !== value) commit(adjust(pantry, id, next - value));
                }}
              />
              <em>g</em>
            </label>
            <button type="button" className="log-list__remove" aria-label={`Fini : ${food!.nom}`} onClick={() => commit(adjust(pantry, id, -value))}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {empty.length ? (
        <p className="muted">
          Fini : {empty.map((item) => item.food!.nom.split(" (")[0]).join(", ")}.{" "}
          <button type="button" className="link-button" onClick={() => commit(empty.reduce((acc, item) => removeFood(acc, item.id), pantry))}>
            Effacer
          </button>
        </p>
      ) : null}

      <div className="form-grid">
        <label className="field field--wide">
          <span>J&apos;ai acheté</span>
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
            <input
              inputMode="numeric"
              value={grams}
              placeholder={foodId ? String(foods.get(foodId)?.poids ?? "") : ""}
              onChange={(event) => setGrams(event.target.value)}
            />
            <em>g</em>
          </div>
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={!foodId}
          onClick={() => {
            const value = Number(grams.replace(",", ".")) || foods.get(foodId)?.poids || 0;
            if (value > 0) commit(adjust(pantry, foodId, value));
            setFoodId("");
            setGrams("");
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter
        </button>
      </div>
    </section>
  );
}
