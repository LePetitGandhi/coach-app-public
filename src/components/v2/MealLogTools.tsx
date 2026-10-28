"use client";

import { useState } from "react";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import type { DailyLog, MealLog } from "@/lib/v2/types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

let counter = 0;
function makeId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PORTIONS = [0.75, 1, 1.25, 1.5, 2];

export function PortionPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="chip-row">
      <span className="chip-row__label">Portion</span>
      <div className="chip-row__items">
        {PORTIONS.map((portion) => (
          <button
            key={portion}
            type="button"
            className={cx("chip", value === portion && "is-active")}
            onClick={() => onChange(portion)}
          >
            ×{String(portion).replace(".", ",")}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Les derniers repas différents des jours précédents, à refaire en un tap. */
export function recentMeals(logs: DailyLog[], today: string, limit = 6): MealLog[] {
  const seen = new Set<string>();
  const result: MealLog[] = [];
  const past = logs.filter((log) => log.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 21);
  for (const log of past) {
    for (const meal of [...log.meals].reverse()) {
      const key = meal.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(meal);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

export function RecentMeals({ meals, onRedo }: { meals: MealLog[]; onRedo: (meal: MealLog) => void }) {
  if (!meals.length) return null;
  return (
    <>
      <h3 className="section-title">Refaire un repas récent</h3>
      <div className="chip-row__items chip-row__items--wrap">
        {meals.map((meal) => (
          <button
            key={meal.id}
            type="button"
            className="chip"
            onClick={() => onRedo({ ...meal, id: makeId("meal") })}
            title={`${meal.proteinG} g · ${meal.calories} kcal`}
          >
            <RotateCcw aria-hidden="true" />
            {meal.name.length > 34 ? `${meal.name.slice(0, 32)}…` : meal.name}
          </button>
        ))}
      </div>
    </>
  );
}

/** Liste des repas du jour : tap sur ✎ pour corriger nom, kcal, protéines. */
export function MealLogList({ meals, onChange }: { meals: MealLog[]; onChange: (meals: MealLog[]) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", calories: "", proteinG: "" });

  if (!meals.length) return <p className="muted">Rien de noté pour l&apos;instant.</p>;

  return (
    <ul className="log-list log-list--editable">
      {meals.map((meal) =>
        editing === meal.id ? (
          <li key={meal.id} className="log-edit">
            <input
              value={draft.name}
              aria-label="Nom du repas"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <div className="log-edit__numbers">
              <label>
                <input
                  inputMode="numeric"
                  value={draft.calories}
                  aria-label="Calories"
                  onChange={(event) => setDraft({ ...draft, calories: event.target.value })}
                />
                <em>kcal</em>
              </label>
              <label>
                <input
                  inputMode="numeric"
                  value={draft.proteinG}
                  aria-label="Protéines"
                  onChange={(event) => setDraft({ ...draft, proteinG: event.target.value })}
                />
                <em>g prot.</em>
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const calories = Number(draft.calories.replace(",", "."));
                  const proteinG = Number(draft.proteinG.replace(",", "."));
                  onChange(
                    meals.map((item) =>
                      item.id === meal.id
                        ? {
                            ...item,
                            name: draft.name.trim() || item.name,
                            calories: Number.isFinite(calories) ? Math.round(calories) : item.calories,
                            proteinG: Number.isFinite(proteinG) ? Math.round(proteinG) : item.proteinG,
                          }
                        : item,
                    ),
                  );
                  setEditing(null);
                }}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                OK
              </button>
            </div>
          </li>
        ) : (
          <li key={meal.id}>
            <span>
              {meal.name}
              <em className="quick-button__meta"> {meal.calories} kcal</em>
            </span>
            <strong>{meal.proteinG} g</strong>
            <button
              type="button"
              className="log-list__remove"
              aria-label={`Modifier ${meal.name}`}
              onClick={() => {
                setDraft({ name: meal.name, calories: String(meal.calories), proteinG: String(meal.proteinG) });
                setEditing(meal.id);
              }}
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              type="button"
              className="log-list__remove"
              aria-label={`Retirer ${meal.name}`}
              onClick={() => onChange(meals.filter((item) => item.id !== meal.id))}
            >
              <X aria-hidden="true" />
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
