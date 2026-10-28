"use client";

import { useMemo, useState } from "react";
import { buildHeatmap, trackedDays, type HeatCell } from "@/lib/v2/heatmap";
import { mealTotals, scoreDailyLog, todayLocalISO } from "@/lib/v2/metrics";
import { countHardSets, workoutVolume } from "@/lib/v2/training";
import type { DailyLog, MealSlotId } from "@/lib/v2/types";

const SKIPPED_LABELS: Record<MealSlotId, string> = {
  petit_dej: "petit-déj",
  dejeuner: "déjeuner",
  collation: "collation",
  diner: "dîner",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const DAY_LABELS = ["L", "", "M", "", "V", "", "D"];

function describe(cell: HeatCell) {
  const date = new Date(`${cell.date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  if (cell.score == null) return `${date} · rien de noté`;
  const parts = [`${date} · score ${cell.score}/100`];
  if (cell.meals) parts.push(`${cell.meals} repas`);
  if (cell.workout) parts.push("séance");
  return parts.join(" · ");
}

function DayDetail({ log, cell }: { log: DailyLog | undefined; cell: HeatCell }) {
  const title = new Date(`${cell.date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (!log || cell.score == null) {
    return (
      <div className="day-detail">
        <div className="day-detail__head">
          <strong>{title}</strong>
          <span className="muted">rien de noté</span>
        </div>
      </div>
    );
  }
  const totals = mealTotals(log);
  const score = scoreDailyLog(log);
  const { weightKg } = log.body;
  const { sleepHours, steps, waterL } = log.recovery;
  const body = [
    weightKg != null ? `${weightKg} kg` : null,
    sleepHours != null ? `${sleepHours} h de sommeil` : null,
    steps != null ? `${steps.toLocaleString("fr-FR")} pas` : null,
    waterL != null ? `${waterL} L d'eau` : null,
  ].filter(Boolean);

  return (
    <div className="day-detail">
      <div className="day-detail__head">
        <strong>{title}</strong>
        <span className={`heat-pill heat-pill--${cell.level}`}>{score.score}/100</span>
      </div>
      <p className="day-detail__line">
        {score.label} · à travailler : {score.primaryGap}
      </p>

      <div className="day-detail__block">
        <span className="eyebrow">
          Repas · {totals.proteinG} g prot. · {totals.calories} kcal
        </span>
        {log.meals.length ? (
          <ul>
            {log.meals.map((meal) => (
              <li key={meal.id}>
                <span>{meal.name}</span>
                <span>
                  {meal.proteinG} g · {meal.calories} kcal
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aucun repas noté.</p>
        )}
        {log.skippedMeals?.length ? (
          <p className="muted">
            Sauté : {log.skippedMeals.map((slot) => SKIPPED_LABELS[slot]).join(", ")}
          </p>
        ) : null}
      </div>

      {log.workouts.length ? (
        <div className="day-detail__block">
          <span className="eyebrow">Séance</span>
          <ul>
            {log.workouts.map((workout) => {
              const done = workout.exercises.filter((exercise) => !exercise.skipped && exercise.sets.length);
              const skipped = workout.exercises.filter((exercise) => exercise.skipped).length;
              return (
                <li key={workout.id}>
                  <span>
                    {workout.focus}
                    {workout.completed ? "" : " (en cours)"}
                  </span>
                  <span>
                    {done.length} exos · {countHardSets(workout)} séries · {workoutVolume(workout)} kg
                    {skipped ? ` · ${skipped} sauté${skipped > 1 ? "s" : ""}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {body.length ? <p className="day-detail__line">{body.join(" · ")}</p> : null}
      {log.notes.trim() ? <p className="day-detail__line">« {log.notes.trim()} »</p> : null}
    </div>
  );
}

export function ActivityHeatmap({ logs, streak }: { logs: DailyLog[]; streak: number }) {
  const cells = useMemo(() => buildHeatmap(logs), [logs]);
  const today = todayLocalISO();
  const [selected, setSelected] = useState(today);
  const flat = cells.flat();
  const current = flat.find((cell) => cell.date === selected) ?? flat.find((cell) => cell.date === today)!;
  const tracked = trackedDays(cells);

  // Libellé du mois au-dessus de la première semaine qui le commence.
  const months = cells.map((week, index) => {
    const first = week[0].date;
    const previous = cells[index - 1]?.[0].date;
    return !previous || first.slice(5, 7) !== previous.slice(5, 7)
      ? new Date(`${first}T12:00:00`).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")
      : "";
  });

  return (
    <section className="panel heatmap-card" aria-label="Régularité">
      <div className="heatmap-card__head">
        <div>
          <span className="eyebrow">Régularité</span>
          <strong>
            {tracked}/28 jours suivis · série {streak} j
          </strong>
        </div>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Moins</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className={`heat heat--${level}`} />
          ))}
          <span>Plus</span>
        </div>
      </div>

      <div className="heatmap" role="grid" aria-label="Score de discipline par jour, 16 dernières semaines">
        <div className="heatmap__days" aria-hidden="true">
          <span />
          {DAY_LABELS.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        {cells.map((week, index) => (
          <div key={week[0].date} className="heatmap__week" role="row">
            <span className="heatmap__month" aria-hidden="true">
              {months[index]}
            </span>
            {week.map((cell) => (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                className={cx(
                  "heat",
                  `heat--${cell.level}`,
                  cell.future && "heat--future",
                  cell.workout && "heat--workout",
                  cell.date === today && "heat--today",
                  cell.date === current.date && "is-selected",
                )}
                disabled={cell.future}
                aria-label={describe(cell)}
                title={describe(cell)}
                onClick={() => setSelected(cell.date)}
              />
            ))}
          </div>
        ))}
      </div>

      <DayDetail log={logs.find((log) => log.date === current.date)} cell={current} />
      <p className="heatmap-readout__hint">Touche une case pour voir le jour · point = séance faite</p>
    </section>
  );
}
