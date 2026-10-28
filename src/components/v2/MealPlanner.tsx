"use client";

import { useMemo, useState } from "react";
import { Check, ChefHat, Footprints, RefreshCw, Settings2, ShoppingCart, Shuffle, Sparkles, Store, Weight } from "lucide-react";
import { RECIPES_BY_ID, type Food } from "@/lib/v2/nutrition";
import { adjust, loadPantry, savePantry } from "@/lib/v2/pantry";
import {
  AISLES,
  coversFullDay,
  DEFAULT_PREFS,
  EXCLUSIONS,
  generatePlan,
  loadPlanner,
  newSeed,
  planPrepMinutes,
  planShopping,
  plannedDayMacros,
  plannedMealCount,
  savePlanner,
  isHeavy,
  shopOf,
  SHOPS,
  SLOTS,
  tripDays,
  tripLabel,
  tripWeights,
  swapMeal,
  unfillableSlots,
  weeklyBudgetCost,
  type ExclusionId,
  type PlannerPrefs,
  type PlannerStore,
} from "@/lib/v2/planner";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const TODAY_INDEX = () => (new Date().getDay() + 6) % 7;
const SLOT_LABEL = new Map(SLOTS.map((slot) => [slot.id, slot.label]));

function PrefsForm({
  prefs,
  onChange,
  onGenerate,
  hasPlan,
  onCancel,
}: {
  prefs: PlannerPrefs;
  onChange: (prefs: PlannerPrefs) => void;
  onGenerate: () => void;
  hasPlan: boolean;
  onCancel: () => void;
}) {
  const issues = unfillableSlots(prefs);

  function toggleSlot(id: PlannerPrefs["slots"][number]) {
    const slots = prefs.slots.includes(id) ? prefs.slots.filter((slot) => slot !== id) : [...prefs.slots, id];
    onChange({ ...prefs, slots });
  }

  function toggleExclusion(id: ExclusionId) {
    const excluded = prefs.excluded.includes(id)
      ? prefs.excluded.filter((item) => item !== id)
      : [...prefs.excluded, id];
    onChange({ ...prefs, excluded });
  }

  return (
    <div className="planner-form">
      <div className="chip-row">
        <span className="chip-row__label">1. Ton magasin</span>
        <div className="shop-grid">
          {SHOPS.map((shop) => (
            <button
              key={shop.id}
              type="button"
              className={cx("shop-card", prefs.shop === shop.id && "is-active")}
              onClick={() => onChange({ ...prefs, shop: shop.id, store: shop.prices })}
            >
              <Store aria-hidden="true" />
              <span>
                <strong>{shop.label}</strong>
                <em>{shop.access}</em>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">Courses</span>
        <div className="chip-row__items">
          {([1, 2] as const).map((trips) => (
            <button
              key={trips}
              type="button"
              className={cx("chip", prefs.trips === trips && "is-active")}
              onClick={() => onChange({ ...prefs, trips })}
            >
              {trips === 1 ? "1 fois / semaine" : "2 fois (lundi + jeudi)"}
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">À porter max</span>
        <div className="chip-row__items">
          {[5, 8, 12].map((kg) => (
            <button
              key={kg}
              type="button"
              className={cx("chip", prefs.maxCarryKg === kg && "is-active")}
              onClick={() => onChange({ ...prefs, maxCarryKg: kg })}
            >
              {kg} kg
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">2. Ton budget</span>
        <div className="form-grid">
          <label className="field">
            <span>Par semaine</span>
            <div className="input-with-suffix">
              <input
                inputMode="numeric"
                value={String(prefs.budgetWeek)}
                onChange={(event) =>
                  onChange({ ...prefs, budgetWeek: Math.max(0, Number(event.target.value.replace(",", ".")) || 0) })
                }
              />
              <em>€</em>
            </div>
          </label>
          <p className="muted field--wide">≈ {Math.round(prefs.budgetWeek * 4.33)} € par mois</p>
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">3. Tes repas</span>
        <div className="chip-row__items">
          {SLOTS.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={cx("chip", prefs.slots.includes(slot.id) && "is-active")}
              onClick={() => toggleSlot(slot.id)}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">Jours</span>
        <div className="chip-row__items">
          {([5, 7] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={cx("chip", prefs.days === days && "is-active")}
              onClick={() => onChange({ ...prefs, days })}
            >
              {days === 5 ? "Lun → ven" : "Toute la semaine"}
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">Temps max</span>
        <div className="chip-row__items">
          {[10, 15, 20].map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={cx("chip", prefs.maxMinutes === minutes && "is-active")}
              onClick={() => onChange({ ...prefs, maxMinutes: minutes })}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        <span className="chip-row__label">4. Sans…</span>
        <div className="chip-row__items">
          {(Object.keys(EXCLUSIONS) as ExclusionId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={cx("chip", prefs.excluded.includes(id) && "is-active")}
              onClick={() => toggleExclusion(id)}
            >
              {EXCLUSIONS[id].label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">Toujours sans porc. Recettes faisables avec une casserole et une poêle.</p>

      {issues.length ? (
        <p className="muted">
          Aucune recette ne passe tes filtres pour : <strong>{issues.map((issue) => issue.label).join(", ")}</strong>.
          Ces repas seront laissés vides.
        </p>
      ) : null}

      <div className="button-row">
        <button type="button" className="primary-button" disabled={!prefs.slots.length} onClick={onGenerate}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Générer mon menu
        </button>
        {hasPlan ? (
          <button type="button" className="secondary-button" onClick={onCancel}>
            Annuler
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={() => onChange(DEFAULT_PREFS)}>
            Valeurs par défaut
          </button>
        )}
      </div>
    </div>
  );
}

export function MealPlanner({
  foods,
  loggedRecipeIds,
  onEat,
  onUneat,
}: {
  foods: Map<string, Food>;
  loggedRecipeIds: Set<string>;
  onEat: (recipeId: string) => void;
  onUneat: (recipeId: string) => void;
}) {
  // Monté seulement après le chargement de la base d'aliments, donc côté client :
  // localStorage est disponible dès le premier rendu.
  const [initial] = useState(() => loadPlanner());
  const [state, setState] = useState<PlannerStore>(initial);
  const [editing, setEditing] = useState(!initial.plan);
  const [draft, setDraft] = useState<PlannerPrefs>(initial.prefs);
  const [dayIndex, setDayIndex] = useState(() => Math.min(TODAY_INDEX(), (initial.plan?.days.length ?? 1) - 1));

  function commit(next: PlannerStore) {
    setState(next);
    savePlanner(next);
  }

  const plan = state.plan;
  const shopping = useMemo(() => (plan ? planShopping(plan, foods) : null), [plan, foods]);
  const budget = useMemo(() => (plan ? weeklyBudgetCost(plan, foods) : 0), [plan, foods]);

  function generate(prefs: PlannerPrefs) {
    const next = generatePlan(prefs, foods, newSeed());
    commit({ ...state, prefs, plan: next, checked: [] });
    setEditing(false);
    setDayIndex(Math.min(TODAY_INDEX(), next.days.length - 1));
  }

  /** Cocher = acheté → ajouté au frigo ; décocher = retiré. */
  function toggleChecked(key: string, foodId?: string, grams?: number) {
    const wasChecked = state.checked.includes(key);
    const checked = wasChecked ? state.checked.filter((id) => id !== key) : [...state.checked, key];
    commit({ ...state, checked });
    if (foodId && grams) savePantry(adjust(loadPantry(), foodId, wasChecked ? -grams : grams));
  }

  if (editing || !plan || !shopping) {
    return (
      <section className="panel planner">
        <div className="panel__title">
          <div>
            <span className="eyebrow">Menu de la semaine</span>
            <h2>Ton menu et ta liste de courses en un clic</h2>
          </div>
          <Sparkles className="panel-icon" aria-hidden="true" />
        </div>
        <p className="muted">Choisis ton magasin, ton budget, tes préférences : l&apos;app compose la semaine.</p>
        <PrefsForm
          prefs={draft}
          onChange={setDraft}
          onGenerate={() => generate(draft)}
          hasPlan={Boolean(plan)}
          onCancel={() => {
            setDraft(state.prefs);
            setEditing(false);
          }}
        />
      </section>
    );
  }

  const day = plan.days[Math.min(dayIndex, plan.days.length - 1)];
  const dayMacros = plannedDayMacros(day, foods, plan.prefs.store);
  const fullDay = coversFullDay(plan.prefs);
  const itemsToBuy = shopping.items.filter((item) => !item.enligne);
  const shop = shopOf(plan.prefs);
  const tripIndexes = plan.prefs.trips === 2 ? [0, 1] : [0];
  const weights = tripWeights(plan, foods);
  const overBudget = budget > plan.prefs.budgetWeek;

  return (
    <>
      <section className="panel planner">
        <div className="panel__title">
          <div>
            <span className="eyebrow">
              Menu de la semaine · {shopOf(plan.prefs).label}
            </span>
            <h2>
              {plannedMealCount(plan)} repas planifiés
            </h2>
          </div>
          <ChefHat className="panel-icon" aria-hidden="true" />
        </div>

        <div className="delta-grid">
          <div className="delta">
            <span>Repas planifiés</span>
            <strong>{plannedMealCount(plan)}</strong>
          </div>
          <div className="delta">
            <span>Articles dans ta liste</span>
            <strong>{itemsToBuy.length}</strong>
          </div>
          <div className="delta">
            <span>Budget estimé / semaine</span>
            <strong className={overBudget ? "delta--bad" : "delta--good"}>{budget.toFixed(2)} €</strong>
          </div>
          <div className="delta">
            <span>À porter{weights.length > 1 ? " (par course)" : ""}</span>
            <strong className={weights.some((w) => w > plan.prefs.maxCarryKg) ? "delta--bad" : "delta--good"}>
              {weights.map((w) => `${w.toFixed(1)} kg`).join(" + ")}
            </strong>
          </div>
          <div className="delta">
            <span>Cuisine sur la semaine</span>
            <strong>
              {Math.floor(planPrepMinutes(plan) / 60)} h {String(planPrepMinutes(plan) % 60).padStart(2, "0")}
            </strong>
          </div>
        </div>
        {overBudget ? (
          <p className="muted">
            Au-dessus de ton budget de {plan.prefs.budgetWeek} € : régénère, ou retire un créneau ou un filtre.
          </p>
        ) : null}

        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => generate(plan.prefs)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Régénérer la semaine
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setDraft(plan.prefs);
              setEditing(true);
            }}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Mes préférences
          </button>
        </div>

        <div className="chip-row__items">
          {plan.days.map((item, index) => (
            <button
              key={item.day}
              type="button"
              className={cx("chip", index === dayIndex && "is-active")}
              onClick={() => setDayIndex(index)}
            >
              {item.day.slice(0, 3)}
            </button>
          ))}
        </div>

        <p className="result-count">
          {dayMacros.kcal} kcal · {dayMacros.prot} g protéines · {dayMacros.gluc} g glucides · {dayMacros.lip} g lipides
          {!fullDay ? " (repas planifiés uniquement)" : ""}
        </p>

        <div className="timeline">
          {day.meals.map((recipeId, mealIndex) => {
            const recipe = RECIPES_BY_ID.get(recipeId);
            if (!recipe) return null;
            const logged = loggedRecipeIds.has(recipe.id);
            return (
              <article key={`${recipeId}-${mealIndex}`} className={cx("timeline-item", logged && "is-logged")}>
                <strong>{recipe.minutes} min</strong>
                <div>
                  <span className="eyebrow">{SLOT_LABEL.get(recipe.type)}</span>
                  <h3>{recipe.nom}</h3>
                  <p className="muted">
                    {recipe.items
                      .map((item) => `${item.grams} g ${(foods.get(item.foodId)?.nom ?? item.foodId).split(" (")[0].toLowerCase()}`)
                      .join(" · ")}
                  </p>
                  <ul>
                    {recipe.etapes.map((etape, index) => (
                      <li key={index}>{etape}</li>
                    ))}
                  </ul>
                  <div className="button-row">
                    {logged ? (
                      <button type="button" className="secondary-button is-done" onClick={() => onUneat(recipe.id)}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Mangé — annuler
                      </button>
                    ) : (
                      <button type="button" className="secondary-button" onClick={() => onEat(recipe.id)}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Marquer comme mangé
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => commit({ ...state, plan: swapMeal(plan, dayIndex, mealIndex, foods) })}
                    >
                      <Shuffle className="h-4 w-4" aria-hidden="true" />
                      Changer ce repas
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {day.extras.length ? (
          <p className="muted">
            <strong>Accompagnement du jour :</strong>{" "}
            {day.extras
              .map((item) => `${item.grams} g de ${(foods.get(item.foodId)?.nom ?? item.foodId).split(" (")[0].toLowerCase()}`)
              .join(", ")}{" "}
            — pour atteindre la cible calorique.
          </p>
        ) : null}
      </section>

      {tripIndexes.map((trip) => {
        const list = planShopping(plan, foods, trip);
        const days = tripDays(plan, trip);
        const tooHeavy = list.poidsKg > plan.prefs.maxCarryKg;
        const doneCount = list.items.filter((item) => state.checked.includes(`${trip}:${item.foodId}`)).length;
        return (
          <section key={trip} className="panel">
            <div className="panel__title">
              <div>
                <span className="eyebrow">{tripLabel(plan, trip)}</span>
                <h2>
                  {list.totalPanier.toFixed(2)} € · {list.poidsKg.toFixed(1)} kg
                </h2>
              </div>
              <ShoppingCart className="panel-icon" aria-hidden="true" />
            </div>

            <p className="muted">
              <Footprints className="inline-icon" aria-hidden="true" /> {shop.label} — {shop.access}.
              {" "}
              {doneCount} / {list.items.length} dans le panier · triée par rayon.
            </p>
            {tooHeavy && shop.walkMin >= 10 ? (
              <p className="coach-line coach-line--warn">
                <Weight className="inline-icon" aria-hidden="true" /> {list.poidsKg.toFixed(1)} kg à porter sur {shop.walkMin} min
                de marche, au-delà de tes {plan.prefs.maxCarryKg} kg.
                {plan.prefs.trips === 1
                  ? " Passe en 2 courses dans tes préférences."
                  : " Prends les articles « lourd » à l'Aldi le plus proche — ou en bus au retour."}
              </p>
            ) : tooHeavy ? (
              <p className="muted">
                <Weight className="inline-icon" aria-hidden="true" /> {list.poidsKg.toFixed(1)} kg, mais le magasin est à côté :
                un sac à dos + un cabas suffisent.{trip === 0 ? " La 1re course est la plus lourde (placard : riz, huile, pâtes…)." : ""}
              </p>
            ) : null}
            {days.length && trip === 1 ? (
              <p className="muted">À faire le {plan.days[days[0]].day.toLowerCase()} — produits frais pour la fin de semaine.</p>
            ) : null}

            {AISLES.map((aisle) => {
              const items = list.items.filter((item) => item.aisle === aisle.id);
              if (!items.length) return null;
              return (
                <div key={aisle.id} className="shopping-group">
                  <h3 className="section-title">{aisle.label}</h3>
                  <ul className="shopping-list">
                    {items.map((item) => {
                      const key = `${trip}:${item.foodId}`;
                      const done = state.checked.includes(key);
                      return (
                        <li key={item.foodId}>
                          <label className={cx("shopping-item", done && "is-done")}>
                            <input type="checkbox" checked={done} onChange={() => toggleChecked(key, item.enligne ? undefined : item.foodId, item.achatG)} />
                            <span className="shopping-item__name">
                              {item.quantite}
                              {isHeavy(item) ? <em className="tag tag--accent">lourd</em> : null}
                              {item.placard && !item.enligne ? <em className="tag tag--pantry">placard</em> : null}
                            </span>
                            <strong>{item.cout.toFixed(2)} €</strong>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}

      <p className="muted planner-footnote">
        Budget estimé : le frais au conditionnement entier, le placard au prorata de ce que tu consommes.
        {shop.estimatedPrices ? ` Prix ${shop.label.split(" ·")[0]} relevés sur tes tickets quand l'article y figure, sinon base Auchan.` : ""} Prix
        indicatifs, à confirmer en rayon.
      </p>
    </>
  );
}
