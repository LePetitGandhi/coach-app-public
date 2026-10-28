"use client";

import { useEffect, useState } from "react";
import { Beef, Check, ChevronRight, Circle, Dumbbell, Footprints, ShoppingCart, Utensils, X } from "lucide-react";
import { GYM, plannedSession, PROGRAM_START, TRAINING_SPLIT, V2_TARGETS, weekdayName } from "@/lib/v2/coachPlan";
import { todayLocalISO } from "@/lib/v2/metrics";
import { sessionToDo } from "@/lib/v2/schedule";
import { indexFoods, loadFoods, RECIPES_BY_ID, recipeToMeal, type Food } from "@/lib/v2/nutrition";
import { loadOnboarding, ONBOARDING_STEPS, saveOnboarding, type OnboardingState } from "@/lib/v2/onboarding";
import { loadPlanner, SLOTS } from "@/lib/v2/planner";
import { loadPantry, proteinTopUp } from "@/lib/v2/pantry";
import type { DailyLog } from "@/lib/v2/types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

let counter = 0;
function makeId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Créneau courant selon l'heure : 0 petit-déj, 1 déjeuner, 2 collation, 3 dîner. */
function currentSlotIndex(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 10.5) return 0;
  if (hour < 15) return 1;
  if (hour < 18.5) return 2;
  return 3;
}

const SLOT_ORDER = SLOTS.map((slot) => slot.id);
const SLOT_LABEL = new Map(SLOTS.map((slot) => [slot.id, slot.label]));

export function TodayFocus({
  today,
  logs,
  updateToday,
  onNavigate,
  onStartWorkout,
}: {
  today: DailyLog;
  logs: DailyLog[];
  updateToday: (log: DailyLog) => void;
  onNavigate: (tab: "nutrition" | "settings") => void;
  onStartWorkout: (title: string) => void;
}) {
  // Monté uniquement après l'hydratation de l'état (côté client).
  const [planner] = useState(() => loadPlanner());
  const [onboarding, setOnboarding] = useState<OnboardingState>(() => loadOnboarding());
  const [foods, setFoods] = useState<Map<string, Food> | null>(null);
  const [pantry, setPantry] = useState(() => loadPantry());

  useEffect(() => {
    const refresh = () => setPantry(loadPantry());
    window.addEventListener("coach:pantry", refresh);
    return () => window.removeEventListener("coach:pantry", refresh);
  }, []);

  useEffect(() => {
    let alive = true;
    loadFoods()
      .then((db) => {
        if (alive) setFoods(indexFoods(db));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function updateOnboarding(next: OnboardingState) {
    setOnboarding(next);
    saveOnboarding(next);
  }

  // --- Démarrage -----------------------------------------------------------
  const autoDone = new Set<string>();
  if (planner.plan) autoDone.add("menu");
  const steps = ONBOARDING_STEPS.map((step) => ({
    ...step,
    done: autoDone.has(step.id) || onboarding.done.includes(step.id),
  }));
  const remaining = steps.filter((step) => !step.done).length;
  const showOnboarding = !onboarding.hidden && remaining > 0;

  // --- Prochain repas ------------------------------------------------------
  const plannedDay = planner.plan?.days.find((day) => day.day === weekdayName()) ?? null;
  const logged = new Set(today.meals.map((meal) => meal.sourceId).filter(Boolean) as string[]);
  const slotNow = currentSlotIndex();
  const pending = (plannedDay?.meals ?? [])
    .map((id) => RECIPES_BY_ID.get(id))
    .filter((recipe) => recipe && !logged.has(recipe.id));
  const nextMeal =
    pending.find((recipe) => recipe && SLOT_ORDER.indexOf(recipe.type) >= slotNow) ?? pending[0] ?? null;
  const eatenCount = (plannedDay?.meals ?? []).filter((id) => logged.has(id)).length;
  const protein = today.meals.reduce((sum, meal) => sum + meal.proteinG, 0);
  const missingProtein = V2_TARGETS.proteinG - protein;
  const evening = new Date().getHours() >= 16;
  const topUp = foods && evening && missingProtein >= 20 ? proteinTopUp(pantry, foods, missingProtein) : null;

  const [lastEaten, setLastEaten] = useState<{ mealId: string; name: string } | null>(null);

  function eat(recipeId: string) {
    const recipe = RECIPES_BY_ID.get(recipeId);
    if (!recipe || !foods) return;
    const meal = recipeToMeal(recipe, foods, makeId("meal"));
    updateToday({ ...today, meals: [...today.meals, meal] });
    setLastEaten({ mealId: meal.id, name: recipe.nom });
  }

  function undoEat() {
    if (!lastEaten) return;
    updateToday({ ...today, meals: today.meals.filter((meal) => meal.id !== lastEaten.mealId) });
    setLastEaten(null);
  }

  // --- Séance --------------------------------------------------------------
  const todo = today.restDay ? null : sessionToDo(logs);
  const session = todo?.session ?? null;
  const planned = plannedSession();
  const workout = today.workouts[today.workouts.length - 1];

  return (
    <section className="panel panel--lead focus-card">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Maintenant</span>
          <h2>{weekdayName()} — ce qu&apos;il reste à faire</h2>
        </div>
      </div>

      {showOnboarding ? (
        <div className="focus-block">
          <div className="focus-block__head">
            <strong>Démarrage · {steps.length - remaining}/{steps.length}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Masquer le démarrage"
              onClick={() => updateOnboarding({ ...onboarding, hidden: true })}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <ul className="focus-steps">
            {steps.map((step) => (
              <li key={step.id} className={cx(step.done && "is-done")}>
                <button
                  type="button"
                  className="focus-steps__check"
                  aria-label={step.done ? `Décocher ${step.label}` : `Cocher ${step.label}`}
                  disabled={autoDone.has(step.id)}
                  onClick={() =>
                    updateOnboarding({
                      ...onboarding,
                      done: step.done
                        ? onboarding.done.filter((id) => id !== step.id)
                        : [...onboarding.done, step.id],
                    })
                  }
                >
                  {step.done ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                </button>
                <span>
                  <strong>{step.label}</strong>
                  <em>{step.detail}</em>
                </span>
                {step.tab && !step.done ? (
                  <button type="button" className="link-button" onClick={() => onNavigate(step.tab!)}>
                    Y aller <ChevronRight className="inline-icon" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="focus-block">
        <div className="focus-row">
          <Utensils aria-hidden="true" />
          {!planner.plan ? (
            <>
              <span>
                <strong>Pas encore de menu</strong>
                <em>Génère-le en 1 clic : les repas s&apos;afficheront ici.</em>
              </span>
              <button type="button" className="primary-button" onClick={() => onNavigate("nutrition")}>
                Générer
              </button>
            </>
          ) : nextMeal ? (
            <>
              <span>
                <strong>
                  {SLOT_LABEL.get(nextMeal.type)} · {nextMeal.nom}
                </strong>
                <em>
                  {nextMeal.minutes} min · {eatenCount}/{plannedDay?.meals.length ?? 0} repas · {protein}/
                  {V2_TARGETS.proteinG} g de protéines
                </em>
              </span>
              <button type="button" className="primary-button" disabled={!foods} onClick={() => eat(nextMeal.id)}>
                <Check className="h-4 w-4" aria-hidden="true" />
                Mangé
              </button>
            </>
          ) : plannedDay ? (
            <span>
              <strong>Tous les repas du jour sont notés</strong>
              <em>{protein} g de protéines aujourd&apos;hui.</em>
            </span>
          ) : (
            <span>
              <strong>Le menu ne couvre pas aujourd&apos;hui</strong>
              <em>Régénère-le en « toute la semaine » dans l&apos;onglet Repas.</em>
            </span>
          )}
        </div>
        {lastEaten && today.meals.some((meal) => meal.id === lastEaten.mealId) ? (
          <p className="undo-line">
            <Check className="inline-icon" aria-hidden="true" /> {lastEaten.name} noté.
            <button type="button" className="link-button" onClick={undoEat}>
              Annuler
            </button>
          </p>
        ) : null}
        {nextMeal ? (
          <button type="button" className="link-button" onClick={() => onNavigate("nutrition")}>
            Recette et étapes <ChevronRight className="inline-icon" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {topUp ? (
        <div className="focus-block focus-block--alert">
          <div className="focus-row">
            <Beef aria-hidden="true" />
            <span>
              <strong>Il te manque {missingProtein} g de protéines</strong>
              <em>
                {topUp.plan.length
                  ? `Avec ton frigo : ${topUp.plan
                      .map((item) => `${item.grams} g de ${item.food.nom.split(" (")[0].toLowerCase()} (≈ ${item.protein} g)`)
                      .join(" + ")}.`
                  : "Rien d'assez protéiné au frigo."}
                {topUp.left > 10 ? ` Encore ${topUp.left} g : un skyr (450 g ≈ 45 g) ou 2 boîtes de thon (≈ 60 g) à l'Aldi.` : ""}
              </em>
            </span>
          </div>
        </div>
      ) : null}

      <div className="focus-block">
        <div className="focus-row">
          {session ? <Dumbbell aria-hidden="true" /> : <Footprints aria-hidden="true" />}
          {workout && !workout.completed ? (
            <span>
              <strong>Séance en cours : {workout.focus}</strong>
              <em>Note tes séries juste en dessous.</em>
            </span>
          ) : workout?.completed ? (
            <span>
              <strong>Séance validée</strong>
              <em>Récupération : protéines, eau, coucher protégé.</em>
            </span>
          ) : session ? (
            <>
              <span>
                <strong>
                  {todo?.kind === "rattrapage" ? "Rattrapage · " : ""}
                  {session.title}
                </strong>
                <em>
                  {todo?.kind === "rattrapage"
                    ? `Prévue ${session.day.toLowerCase()}, pas faite : on la décale à aujourd'hui.`
                    : `${GYM.name} · ${session.exercises.length} exercices pré-remplis`}
                </em>
                {todo?.kind === "rattrapage" && planned && planned.title !== session.title ? (
                  <button type="button" className="link-button" onClick={() => onStartWorkout(planned.title)}>
                    Faire plutôt celle du jour ({planned.title})
                  </button>
                ) : null}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => updateToday({ ...today, restDay: true, updatedAt: new Date().toISOString() })}
                >
                  Repos aujourd&apos;hui, je la fais demain
                </button>
              </span>
              <button type="button" className="primary-button" onClick={() => onStartWorkout(session.title)}>
                Démarrer
              </button>
            </>
          ) : todayLocalISO() < PROGRAM_START ? (
            <span>
              <strong>Première séance : {TRAINING_SPLIT[0].title}</strong>
              <em>Lundi, {GYM.name}. Exercices pré-remplis, reprise à ~85 % de tes charges de mai.</em>
            </span>
          ) : today.restDay ? (
            <span>
              <strong>Repos choisi aujourd&apos;hui</strong>
              <em>La séance revient demain en rattrapage. Objectif : {V2_TARGETS.steps.toLocaleString("fr-FR")} pas.</em>
              <button
                type="button"
                className="link-button"
                onClick={() => updateToday({ ...today, restDay: false, updatedAt: new Date().toISOString() })}
              >
                Finalement je m&apos;entraîne
              </button>
            </span>
          ) : (
            <span>
              <strong>Repos musculation</strong>
              <em>Objectif du jour : {V2_TARGETS.steps.toLocaleString("fr-FR")} pas.</em>
            </span>
          )}
        </div>
      </div>

      {planner.plan && !showOnboarding ? (
        <button type="button" className="link-button" onClick={() => onNavigate("nutrition")}>
          <ShoppingCart className="inline-icon" aria-hidden="true" /> Liste de courses
        </button>
      ) : null}
    </section>
  );
}
