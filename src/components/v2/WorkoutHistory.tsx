"use client";

import { History } from "lucide-react";
import { countHardSets, formatSet, workoutVolume } from "@/lib/v2/training";
import type { DailyLog, WorkoutLog } from "@/lib/v2/types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function dayLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/** Une séance compte dès qu'une série est notée, même si elle n'a pas été « terminée ». */
function hasContent(workout: WorkoutLog) {
  return workout.completed || workout.exercises.some((exercise) => exercise.sets.length > 0);
}

export type PastWorkout = { date: string; workout: WorkoutLog };

/** Séances passées (hors aujourd'hui), de la plus récente à la plus ancienne. */
export function pastWorkouts(logs: DailyLog[], today: string, limit = 12): PastWorkout[] {
  return logs
    .filter((log) => log.date < today)
    .flatMap((log) => log.workouts.filter(hasContent).map((workout) => ({ date: log.date, workout })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Historique consultable des séances : ce qui a été noté, série par série. */
export function WorkoutHistory({ logs, today }: { logs: DailyLog[]; today: string }) {
  const past = pastWorkouts(logs, today);

  return (
    <section className="panel">
      <div className="panel__title">
        <div>
          <span className="eyebrow">Historique</span>
          <h2>Séances passées</h2>
        </div>
        <History className="panel-icon" aria-hidden="true" />
      </div>
      {past.length === 0 ? (
        <p className="muted">Aucune séance notée pour l&apos;instant.</p>
      ) : (
        <div className="history-list">
          {past.map(({ date, workout }, index) => (
            <details key={`${date}-${workout.id}`} className="history-item" open={index === 0}>
              <summary>
                <span className="history-item__date">{dayLabel(date)}</span>
                <strong>{workout.focus}</strong>
                <em className="quick-button__meta">
                  {countHardSets(workout)} séries · {workoutVolume(workout)} kg
                  {workout.completed ? "" : " · non terminée"}
                </em>
              </summary>
              <ul className="log-list">
                {workout.exercises.map((exercise) => (
                  <li key={exercise.id}>
                    <span>
                      {exercise.name}
                      {exercise.replacedFrom ? (
                        <em className="quick-button__meta"> au lieu de {exercise.replacedFrom}</em>
                      ) : null}
                      {exercise.feel ? <em className={cx("tag", `feel--${exercise.feel}`)}>{exercise.feel}</em> : null}
                    </span>
                    <strong>{exercise.skipped ? "sauté" : exercise.sets.map(formatSet).join(" · ") || "—"}</strong>
                  </li>
                ))}
              </ul>
              {workout.note ? <p className="muted">« {workout.note} »</p> : null}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
